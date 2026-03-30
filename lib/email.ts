import nodemailer from 'nodemailer';

// Nodemailer will throw soft warnings if credentials aren't provided, but won't crash the server.
export const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER || 'mock@test.com',
    pass: process.env.EMAIL_PASS || 'mock_pass',
  },
});

import fs from 'fs';
import path from 'path';

export async function quietlySendEmail(to: string, subject: string, html: string) {
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    const logHeader = `\n================== [MOCK EMAIL BRIDGE: ${new Date().toLocaleString()}] ==================\n`;
    const logEntry = `${logHeader}To: ${to}\nSubject: ${subject}\nBody (HTML):\n${html}\n===========================================================\n`;
    
    // Log to standard console
    console.log(logEntry);

    // Also persist to a file in the workspace so the user can see it in their IDE
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
      from: `"DTCGC Logistics" <${process.env.EMAIL_USER}>`,
      to,
      subject,
      html,
    });
    console.log(`Quiet notification dispatched to ${to}`);
  } catch (error) {
    console.error("Critical failure during Gmail SMTP transmission:", error);
  }
}
