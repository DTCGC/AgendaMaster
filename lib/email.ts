/**
 * Email Dispatch Module
 *
 * All outbound emails from AgendaMaster flow through this module.
 * Uses the Resend HTTP API to bypass DigitalOcean's SMTP port blocks.
 *
 * In development (no RESEND_API_KEY), emails are mock-logged to
 * console + `logs/mock-emails.md` for inspection.
 *
 * Environment variables:
 *   RESEND_API_KEY     — Resend API key (omit for mock mode)
 *   RESEND_FROM_EMAIL  — Sender address, e.g. "AgendaMaster <info@coquitlamgavel.com>"
 */

import { Resend } from 'resend';
import fs from 'fs';
import path from 'path';

// Initialize the Resend SDK. null = development mock mode.
const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

// Sender identity shown in recipient inboxes. Falls back to Resend's sandbox domain.
export const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || 'DTCGC Portal <onboarding@resend.dev>';

/** The bare address inside FROM_EMAIL ("Name <addr@host>" or just "addr@host"). */
export const FROM_ADDRESS = (FROM_EMAIL.match(/<([^>]+)>/)?.[1] ?? FROM_EMAIL).trim();

/** Resend accepts at most 50 recipients per email, counting to + cc + bcc. */
const MAX_RECIPIENTS_PER_EMAIL = 50;

/**
 * Sends one email to one recipient through the Resend HTTP API (avoids the
 * Droplet's SMTP port blocks). Falls back to mock logging in development.
 *
 * @throws When Resend rejects the send — callers decide how to recover.
 */
export async function sendEmail(to: string, subject: string, html: string, options?: { replyTo?: string }) {
  if (!resend) {
    // Development fallback: write a human-readable mock to console and a log file
    const logHeader = `\n================== [MOCK EMAIL BRIDGE: ${new Date().toLocaleString()}] ==================\n`;
    const logEntry = `${logHeader}To: ${to}\nReply-To: ${options?.replyTo || 'None'}\nSubject: ${subject}\nBody (HTML):\n${html}\n===========================================================\n`;
    
    console.log(logEntry);

    try {
        const logDir = path.join(process.cwd(), 'logs');
        if (!fs.existsSync(logDir)) fs.mkdirSync(logDir);
        fs.appendFileSync(path.join(logDir, 'mock-emails.md'), logEntry);
    } catch (e) {
        console.error("Failed to write to mock email log file:", e);
    }
    return;
  }

  try {
    // POST /emails via Resend HTTP API — single recipient, direct delivery.
    // NOTE: the SDK field is `replyTo` (camelCase). It normalizes the payload
    // through an allowlist (`reply_to: email.replyTo`), so a snake_case
    // `reply_to` key here is silently DROPPED and the header never ships.
    const { data, error } = await resend.emails.send({
      from: FROM_EMAIL,
      to,
      subject,
      html,
      ...(options?.replyTo ? { replyTo: options.replyTo } : {}),
    });
    
    if (error) throw new Error(error.message);
    
    console.log(`✓ Email dispatched to ${to} (ID: ${data?.id})`);
  } catch (error) {
    console.error("Email API transmission failure:", error);
    throw error; // Propagate so callers can handle (e.g. AccountActionButtons)
  }
}

/**
 * Splits recipients into BCC batches. The club's own address is each email's
 * nominal "to" (Resend requires one), so a batch holds one fewer than the limit.
 */
export function bccBatches(recipients: string[]): string[][] {
  const size = MAX_RECIPIENTS_PER_EMAIL - 1;
  const batches: string[][] = [];
  for (let i = 0; i < recipients.length; i += size) batches.push(recipients.slice(i, i + size));
  return batches;
}

/**
 * Sends one email to many recipients via BCC, in batches that fit Resend's
 * per-email recipient limit. Never throws: a failed batch is counted, so the
 * caller can tell a partial send from a total failure.
 */
export async function sendBccEmail(recipients: string[], subject: string, html: string, options?: { replyTo?: string }) {
  const unique = Array.from(new Set(recipients));
  if (unique.length === 0) return { succeeded: 0, failed: 0, total: 0 };

  if (!resend) {
    console.log(`[MOCK BCC]: Simulated HTTP dispatch to ${unique.length} users. Reply-To: ${options?.replyTo || 'None'}`);
    return { succeeded: unique.length, failed: 0, total: unique.length };
  }

  let succeeded = 0;
  let failed = 0;
  for (const batch of bccBatches(unique)) {
    try {
      const { error } = await resend.emails.send({
        from: FROM_EMAIL,
        to: FROM_ADDRESS,
        bcc: batch,
        subject,
        html,
        ...(options?.replyTo ? { replyTo: options.replyTo } : {}),
      });
      if (error) throw new Error(error.message);
      succeeded += batch.length;
    } catch (error) {
      console.error(`BCC batch of ${batch.length} failed:`, error);
      failed += batch.length;
    }
  }

  console.log(`✓ BCC email: ${succeeded} of ${unique.length} recipients dispatched via Resend`);
  return { succeeded, failed, total: unique.length };
}
