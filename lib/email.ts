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
const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || 'DTCGC Portal <onboarding@resend.dev>';

/**
 * Production HTTP API bridge for all app-initiated emails.
 * Avoids DO droplet SMTP port blocks and streamlines mass announcements.
 * Falls back to mock logging in development if credentials aren't set.
 */
export async function quietlySendEmail(to: string, subject: string, html: string, options?: { reply_to?: string }) {
  if (!resend) {
    // Development fallback: write a human-readable mock to console and a log file
    const logHeader = `\n================== [MOCK EMAIL BRIDGE: ${new Date().toLocaleString()}] ==================\n`;
    const logEntry = `${logHeader}To: ${to}\nReply-To: ${options?.reply_to || 'None'}\nSubject: ${subject}\nBody (HTML):\n${html}\n===========================================================\n`;
    
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
    // POST /emails via Resend HTTP API — single recipient, direct delivery
    const { data, error } = await resend.emails.send({
      from: FROM_EMAIL,
      to,
      subject,
      html,
      ...(options?.reply_to ? { reply_to: options.reply_to } : {}),
    });
    
    if (error) throw new Error(error.message);
    
    console.log(`✓ Email dispatched to ${to} (ID: ${data?.id})`);
  } catch (error) {
    console.error("Email API transmission failure:", error);
    throw error; // Propagate so callers can handle (e.g. AccountActionButtons)
  }
}

/**
 * Sends a single email to multiple recipients via BCC using the Resend API.
 */
export async function sendBccEmail(recipients: string[], subject: string, html: string, options?: { reply_to?: string }) {
  const unique = Array.from(new Set(recipients));
  if (unique.length === 0) return { succeeded: 0, failed: 0, total: 0 };

  if (!resend) {
    console.log(`[MOCK BCC]: Simulated HTTP dispatch to ${unique.length} users. Reply-To: ${options?.reply_to || 'None'}`);
    return { succeeded: unique.length, failed: 0, total: unique.length };
  }

  try {
    // POST /emails via Resend HTTP API — BCC pattern for mass delivery.
    // Resend requires a non-empty "to" field even when using BCC,
    // so we use the club's own address as the nominal recipient.
    const { data: _data, error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: FROM_EMAIL.split('<')[1]?.replace('>', '') || 'onboarding@resend.dev',
      bcc: unique,
      subject,
      html,
      ...(options?.reply_to ? { reply_to: options.reply_to } : {}),
    });
    
    if (error) throw new Error(error.message);
    
    console.log(`✓ BCC Email dispatched to ${unique.length} recipients via Resend`);
    return { succeeded: unique.length, failed: 0, total: unique.length };
  } catch (error) {
    console.error("BCC Email API transmission failure:", error);
    return { succeeded: 0, failed: unique.length, total: unique.length };
  }
}

