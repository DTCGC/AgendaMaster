import nodemailer from 'nodemailer';
import fs from 'fs';
import path from 'path';

/**
 * Production Gmail SMTP transport for admin-initiated emails.
 * Uses EMAIL_USER + EMAIL_PASS (Gmail App Password) from environment.
 * Falls back to mock logging in development if credentials aren't set.
 */
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

/**
 * Sends an email via the admin Gmail SMTP bridge.
 * Used for: account approval/denial notifications, admin mass comms.
 * In development (no EMAIL_USER set), logs to /logs/mock-emails.md instead.
 */
export async function quietlySendEmail(to: string, subject: string, html: string) {
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    // Development fallback: log to console + file
    const logHeader = `\n================== [MOCK EMAIL BRIDGE: ${new Date().toLocaleString()}] ==================\n`;
    const logEntry = `${logHeader}To: ${to}\nSubject: ${subject}\nBody (HTML):\n${html}\n===========================================================\n`;
    
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
    await transporter.sendMail({
      from: `"DTCGC Portal" <${process.env.EMAIL_USER}>`,
      to,
      subject,
      html,
    });
    console.log(`✓ Email dispatched to ${to}`);
  } catch (error) {
    console.error("Email transmission failure:", error);
    throw error; // Propagate so callers can handle
  }
}

/**
 * Sends an email to multiple recipients via admin SMTP bridge.
 * Deduplicates and processes in parallel.
 */
export async function sendBulkEmail(recipients: string[], subject: string, html: string) {
  const unique = Array.from(new Set(recipients));
  const results = await Promise.allSettled(
    unique.map(email => quietlySendEmail(email, subject, html))
  );

  const succeeded = results.filter(r => r.status === 'fulfilled').length;
  const failed = results.filter(r => r.status === 'rejected').length;

  return { succeeded, failed, total: unique.length };
}
