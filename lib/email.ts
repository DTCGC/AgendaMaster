/**
 * Email Dispatch Module
 *
 * All outbound emails from AgendaMaster flow through this module.
 * Uses the Resend HTTP API to bypass DigitalOcean's SMTP port blocks.
 *
 * In development (no RESEND_API_KEY), emails are mock-logged to
 * console + `logs/mock-emails.md` for inspection.
 *
 * Resend limits this module stays inside (https://resend.com/docs/api-reference/rate-limit):
 *   - 10 requests per second per team, shared by every PM2 worker. Requests
 *     are spaced out, and a 429 is retried after the `retry-after` it names.
 *   - 50 recipients per email, counting to + cc + bcc (see bccBatches).
 *   - 40 MB per email after base64 (attachments are capped well below that
 *     in lib/email-limits.ts).
 *   - The free plan's daily quota counts every recipient (lib/email-quota.ts).
 * Every request carries an idempotency key, so a retry after a timeout or a
 * 5xx can never deliver the same email twice.
 *
 * Environment variables:
 *   RESEND_API_KEY     — Resend API key (omit for mock mode)
 *   RESEND_FROM_EMAIL  — Sender address, e.g. "Downtown Coquitlam Gavel Club <info@coquitlamgavel.com>"
 */

import { Resend, type CreateEmailOptions, type ErrorResponse } from 'resend';
import { randomUUID } from 'crypto';
import fs from 'fs';
import path from 'path';
import { CLUB_GOOGLE_EMAIL } from '@/lib/club-google';
import { recordUsage } from '@/lib/email-quota';

// Initialize the Resend SDK. null = development mock mode.
const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

// Sender identity shown in recipient inboxes. Falls back to Resend's sandbox domain.
export const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || 'DTCGC Portal <onboarding@resend.dev>';

/** The bare address inside FROM_EMAIL ("Name <addr@host>" or just "addr@host"). */
export const FROM_ADDRESS = (FROM_EMAIL.match(/<([^>]+)>/)?.[1] ?? FROM_EMAIL).trim();

/** Resend accepts at most 50 recipients per email, counting to + cc + bcc. */
const MAX_RECIPIENTS_PER_EMAIL = 50;

/**
 * The visible "To" of a BCC email (Resend requires one). The club's Gmail
 * rather than FROM_ADDRESS: mail to info@ comes back through Resend's inbound
 * webhook, and every received email costs another unit of the daily quota.
 * This way each batch costs one extra unit instead of two, and the club's
 * inbox keeps a copy of everything that went out.
 */
const BCC_VISIBLE_TO = CLUB_GOOGLE_EMAIL;

/**
 * Minimum gap between this process's Resend requests. Resend allows 10 per
 * second across the whole team; PM2 runs one worker per CPU, so each keeps to
 * 4 per second and two busy workers still fit.
 */
const MIN_REQUEST_GAP_MS = 250;

/** First try plus three retries. */
const MAX_ATTEMPTS = 4;

/** Never wait longer than this on a single retry-after. */
const MAX_RETRY_DELAY_MS = 15_000;

export type EmailAttachment = { filename: string; content: Buffer; contentType?: string };

export type EmailOptions = {
  replyTo?: string;
  /** Display name to send under, in place of the one in RESEND_FROM_EMAIL. */
  fromName?: string;
  attachments?: EmailAttachment[];
};

/** A send Resend refused. `code` is Resend's error name, e.g. "daily_quota_exceeded". */
export class EmailSendError extends Error {
  readonly code: string;
  readonly statusCode: number | null;
  constructor(error: ErrorResponse) {
    super(error.message);
    this.name = 'EmailSendError';
    this.code = error.name;
    this.statusCode = error.statusCode;
  }
  /** The account is out of quota: further sends today (or this month) will fail too. */
  get quotaExhausted() {
    return this.code === 'daily_quota_exceeded' || this.code === 'monthly_quota_exceeded';
  }
}

/**
 * Whether a failed request is worth repeating with the same idempotency key.
 * Quota errors also arrive as 429s, but waiting does not fix them.
 */
export function isRetryableError(error: ErrorResponse): boolean {
  if (error.name === 'daily_quota_exceeded' || error.name === 'monthly_quota_exceeded') return false;
  if (error.name === 'rate_limit_exceeded' || error.name === 'concurrent_idempotent_requests') return true;
  // No status: the request never got an answer (network failure or timeout).
  // Resend may or may not have sent it; the idempotency key makes asking again safe.
  if (error.statusCode === null) return true;
  return error.statusCode === 429 || error.statusCode >= 500;
}

/** How long to wait before attempt `attempt + 1`: Resend's retry-after when given, else 1s, 2s, 4s. */
export function retryDelayMs(headers: Record<string, string> | null, attempt: number): number {
  const retryAfter = Number(headers?.['retry-after']);
  const base = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 1000 * 2 ** (attempt - 1);
  return Math.min(MAX_RETRY_DELAY_MS, base + Math.floor(Math.random() * 250));
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

let nextRequestAt = 0;

/** Waits for this process's next free request slot. The slot is claimed synchronously, so concurrent callers queue up. */
async function takeRequestSlot() {
  const now = Date.now();
  const wait = Math.max(0, nextRequestAt - now);
  nextRequestAt = Math.max(now, nextRequestAt) + MIN_REQUEST_GAP_MS;
  if (wait > 0) await sleep(wait);
}

/**
 * "Name" <FROM_ADDRESS>, with anything that could break out of the quoted
 * name removed. The address is always ours: Resend sends only from verified
 * domains, and mail from anyone else's would fail DMARC and bounce.
 */
export function fromWithName(name: string | undefined): string {
  const cleaned = (name ?? '').replace(/[\u0000-\u001f\u007f"<>\\]/g, '').replace(/\s+/g, ' ').trim().slice(0, 70);
  return cleaned ? `"${cleaned}" <${FROM_ADDRESS}>` : FROM_EMAIL;
}

/**
 * POST /emails with throttling and retries. `counted` is the send's cost
 * against the quota (its recipient count), used when Resend doesn't report one.
 *
 * @throws EmailSendError when Resend refuses the email or retries run out.
 */
async function deliver(payload: CreateEmailOptions, counted: number): Promise<string | undefined> {
  const client = resend!;
  // One key for every attempt at this email: that is what makes retrying safe.
  const idempotencyKey = randomUUID();
  for (let attempt = 1; ; attempt++) {
    await takeRequestSlot();
    const { data, error, headers } = await client.emails.send(payload, { idempotencyKey });
    if (!error) {
      await recordUsage(headers, counted);
      return data?.id;
    }
    if (attempt >= MAX_ATTEMPTS || !isRetryableError(error)) throw new EmailSendError(error);
    const delay = retryDelayMs(headers, attempt);
    console.warn(`Resend ${error.name} (${error.statusCode ?? 'no response'}); retrying in ${delay} ms (attempt ${attempt + 1} of ${MAX_ATTEMPTS}).`);
    await sleep(delay);
  }
}

/**
 * Attachments as base64 strings. The SDK accepts a Buffer, but posts it as
 * JSON — `{"type":"Buffer","data":[37,80,…]}`, about 3.5 bytes per byte of
 * file — where base64 costs 1.33.
 */
function toResendAttachments(attachments: EmailAttachment[] | undefined) {
  if (!attachments?.length) return {};
  return {
    attachments: attachments.map((a) => ({
      filename: a.filename,
      content: a.content.toString('base64'),
      ...(a.contentType ? { contentType: a.contentType } : {}),
    })),
  };
}

/** Writes a human-readable copy of an email to the console and logs/mock-emails.md. */
function mockLog(header: string, subject: string, html: string, options?: EmailOptions) {
  const files = options?.attachments?.map((a) => `${a.filename} (${a.content.length} bytes)`).join(', ') || 'None';
  const logHeader = `\n================== [MOCK EMAIL BRIDGE: ${new Date().toLocaleString()}] ==================\n`;
  const logEntry = `${logHeader}${header}\nFrom: ${fromWithName(options?.fromName)}\nReply-To: ${options?.replyTo || 'None'}\nSubject: ${subject}\nAttachments: ${files}\nBody (HTML):\n${html}\n===========================================================\n`;

  console.log(logEntry);

  try {
    const logDir = path.join(process.cwd(), 'logs');
    if (!fs.existsSync(logDir)) fs.mkdirSync(logDir);
    fs.appendFileSync(path.join(logDir, 'mock-emails.md'), logEntry);
  } catch (e) {
    console.error("Failed to write to mock email log file:", e);
  }
}

/**
 * Sends one email to one recipient through the Resend HTTP API (avoids the
 * Droplet's SMTP port blocks). Falls back to mock logging in development.
 *
 * @throws EmailSendError when Resend rejects the send — callers decide how to recover.
 */
export async function sendEmail(to: string, subject: string, html: string, options?: EmailOptions) {
  if (!resend) {
    mockLog(`To: ${to}`, subject, html, options);
    return;
  }

  try {
    // NOTE: the SDK field is `replyTo` (camelCase). It normalizes the payload
    // through an allowlist (`reply_to: email.replyTo`), so a snake_case
    // `reply_to` key here is silently DROPPED and the header never ships.
    const id = await deliver({
      from: fromWithName(options?.fromName),
      to,
      subject,
      html,
      ...(options?.replyTo ? { replyTo: options.replyTo } : {}),
      ...toResendAttachments(options?.attachments),
    }, 1);

    console.log(`✓ Email dispatched to ${to} (ID: ${id})`);
  } catch (error) {
    console.error("Email API transmission failure:", error);
    throw error; // Propagate so callers can handle (e.g. AccountActionButtons)
  }
}

/**
 * Splits recipients into BCC batches. Each email also has a visible "to"
 * (Resend requires one), so a batch holds one fewer than the limit.
 */
export function bccBatches(recipients: string[]): string[][] {
  const size = MAX_RECIPIENTS_PER_EMAIL - 1;
  const batches: string[][] = [];
  for (let i = 0; i < recipients.length; i += size) batches.push(recipients.slice(i, i + size));
  return batches;
}

/** Quota units a BCC send to `recipientCount` people uses: each recipient, plus each batch's visible To. */
export function bccQuotaCost(recipientCount: number): number {
  return recipientCount + Math.ceil(recipientCount / (MAX_RECIPIENTS_PER_EMAIL - 1));
}

export type BccResult = {
  succeeded: number;
  failed: number;
  total: number;
  /** Resend reported the quota used up, so the remaining batches were not attempted. */
  quotaExhausted: boolean;
};

/**
 * Sends one email to many recipients via BCC, in batches that fit Resend's
 * per-email recipient limit. Never throws: a failed batch is counted, so the
 * caller can tell a partial send from a total failure.
 *
 * Batches go out one at a time (the batch endpoint cannot carry attachments).
 * Once Resend reports the quota exhausted, the rest are not attempted: they
 * would all fail, and each refusal is another request against the rate limit.
 */
export async function sendBccEmail(recipients: string[], subject: string, html: string, options?: EmailOptions): Promise<BccResult> {
  const unique = Array.from(new Set(recipients));
  if (unique.length === 0) return { succeeded: 0, failed: 0, total: 0, quotaExhausted: false };

  if (!resend) {
    mockLog(`To: ${BCC_VISIBLE_TO}\nBcc (${unique.length}): ${unique.join(', ')}`, subject, html, options);
    return { succeeded: unique.length, failed: 0, total: unique.length, quotaExhausted: false };
  }

  let succeeded = 0;
  let failed = 0;
  let quotaExhausted = false;
  for (const batch of bccBatches(unique)) {
    if (quotaExhausted) {
      failed += batch.length;
      continue;
    }
    try {
      await deliver({
        from: fromWithName(options?.fromName),
        to: BCC_VISIBLE_TO,
        bcc: batch,
        subject,
        html,
        ...(options?.replyTo ? { replyTo: options.replyTo } : {}),
        ...toResendAttachments(options?.attachments),
      }, batch.length + 1);
      succeeded += batch.length;
    } catch (error) {
      console.error(`BCC batch of ${batch.length} failed:`, error);
      failed += batch.length;
      if (error instanceof EmailSendError && error.quotaExhausted) quotaExhausted = true;
    }
  }

  console.log(`✓ BCC email: ${succeeded} of ${unique.length} recipients dispatched via Resend`);
  return { succeeded, failed, total: unique.length, quotaExhausted };
}
