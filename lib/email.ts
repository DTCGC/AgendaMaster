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
 * Sends a single email to multiple recipients via BCC using the admin SMTP bridge.
 */
export async function sendBccEmail(recipients: string[], subject: string, html: string) {
  const unique = Array.from(new Set(recipients));
  if (unique.length === 0) return { succeeded: 0, failed: 0, total: 0 };

  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    console.log(`[MOCK BCC]: Simulated dispatch to ${unique.length} users.`);
    return { succeeded: unique.length, failed: 0, total: unique.length };
  }

  try {
    await transporter.sendMail({
      from: `"DTCGC Portal" <${process.env.EMAIL_USER}>`,
      to: process.env.EMAIL_USER,
      bcc: unique,
      subject,
      html,
    });
    console.log(`✓ BCC Email dispatched to ${unique.length} recipients`);
    return { succeeded: unique.length, failed: 0, total: unique.length };
  } catch (error) {
    console.error("BCC Email transmission failure:", error);
    return { succeeded: 0, failed: unique.length, total: unique.length };
  }
}
