/**
 * Email Dispatch Module
 *
 * Broadcasts and account emails go out through the Gmail API as the club's
 * connected Google account (lib/club-google.ts), the same account that sends
 * the agenda for members without Google. The Gmail API is HTTPS, so the
 * Droplet's SMTP port blocks don't matter.
 *
 * Gmail's limits for a personal account (https://support.google.com/mail/answer/22839):
 * 500 recipients per email and 500 emails a day. The club is far below both;
 * a broadcast past the per-email cap is refused before anything is sent.
 *
 * Outside production, emails are mock-logged to the console and
 * `logs/mock-emails.md` instead, so development never mails the club.
 */

import fs from 'fs';
import path from 'path';
import { CLUB_GOOGLE_EMAIL, ClubGoogleUnavailableError, getClubAccessToken } from '@/lib/club-google';
import { sendGmailAsUser, type GmailAttachment } from '@/lib/google-api';

/** Sender identity shown in recipient inboxes. */
export const FROM_EMAIL = `"Downtown Coquitlam Gavel Club" <${CLUB_GOOGLE_EMAIL}>`;

/** Gmail refuses an email to more people than this (To + Cc + Bcc). */
export const MAX_RECIPIENTS_PER_EMAIL = 500;

export type EmailAttachment = GmailAttachment;

export type EmailOptions = {
  replyTo?: string;
  attachments?: EmailAttachment[];
};

const isMockMode = () => process.env.NODE_ENV !== 'production';

/** Why a send failed, worded for the admin who tried it. */
export function emailFailureReason(error: unknown): string {
  if (error instanceof ClubGoogleUnavailableError) {
    return "The club's Google account isn't connected (or the connection was revoked), so email can't be sent from it. Reconnect it on the Member Management page, then try again.";
  }
  return "Gmail didn't accept the email, so nobody received it. If the club account has already sent to 500 people today, Gmail's daily limit is the cause; otherwise try again in a few minutes.";
}

/** Writes a human-readable copy of an email to the console and logs/mock-emails.md. */
function mockLog(header: string, subject: string, html: string, options?: EmailOptions) {
  const files = options?.attachments?.map((a) => `${a.filename} (${a.content.length} bytes)`).join(', ') || 'None';
  const logHeader = `\n================== [MOCK EMAIL BRIDGE: ${new Date().toLocaleString()}] ==================\n`;
  const logEntry = `${logHeader}${header}\nFrom: ${FROM_EMAIL}\nReply-To: ${options?.replyTo || 'None'}\nSubject: ${subject}\nAttachments: ${files}\nBody (HTML):\n${html}\n===========================================================\n`;

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
 * Sends one email to one person from the club's Gmail.
 *
 * @throws ClubGoogleUnavailableError when the club account isn't connected,
 *   or Gmail's error when it refuses the send. Callers decide how to recover;
 *   emailFailureReason() words either for the admin.
 */
export async function sendEmail(to: string, subject: string, html: string, options?: EmailOptions) {
  if (isMockMode()) {
    mockLog(`To: ${to}`, subject, html, options);
    return;
  }

  try {
    const id = await sendGmailAsUser(await getClubAccessToken(), [to], subject, html, { ...options, from: FROM_EMAIL, bcc: false });
    console.log(`✓ Email dispatched to ${to} (ID: ${id})`);
  } catch (error) {
    console.error("Email transmission failure:", error);
    throw error;
  }
}

/**
 * Sends one email to many people from the club's Gmail, every one of them in
 * Bcc. It is a single message, so it reaches everyone or no one.
 *
 * @returns How many distinct recipients it went to.
 * @throws As sendEmail, or when there are more recipients than one email can carry.
 */
export async function sendBccEmail(recipients: string[], subject: string, html: string, options?: EmailOptions): Promise<number> {
  const unique = Array.from(new Set(recipients));
  if (unique.length === 0) return 0;
  if (unique.length > MAX_RECIPIENTS_PER_EMAIL) {
    throw new Error(`Gmail sends one email to at most ${MAX_RECIPIENTS_PER_EMAIL} recipients; this one has ${unique.length}.`);
  }

  if (isMockMode()) {
    mockLog(`Bcc (${unique.length}): ${unique.join(', ')}`, subject, html, options);
    return unique.length;
  }

  const id = await sendGmailAsUser(await getClubAccessToken(), unique, subject, html, { ...options, from: FROM_EMAIL });
  console.log(`✓ BCC email to ${unique.length} recipients dispatched via Gmail (ID: ${id})`);
  return unique.length;
}
