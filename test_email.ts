import { db } from './lib/db';
import { sendBccEmail } from './lib/email';
import * as dotenv from 'dotenv';
dotenv.config();

async function run() {
  console.log("Fetching all members from development DB...");
  const mems = await db.user.findMany({
    where: { role: { in: ['MEMBER', 'ADMIN'] } }
  });
  
  const emails = mems.map(m => m.email);
  console.log(`Found ${emails.length} active recipients.`);
  
  if (emails.length === 0) {
    console.log("No members found to email.");
    return;
  }
  
  const htmlBody = `
    <div style="font-family: sans-serif; padding: 20px;">
        <h2>DTCGC Architecture Update: Resend Matrix Online</h2>
        <p>This is an automated test broadcast sent via the new Resend API bridge.</p>
        <p>If you're reading this, the deployment successfully bypassed the DigitalOcean SMTP blockage!</p>
    </div>
  `;
  
  console.log("Dispatching test payload...");
  const result = await sendBccEmail(emails, "System Broadcast Test", htmlBody);
  
  console.log("Transmission report:", result);
}

run()
  .then(() => process.exit(0))
  .catch(err => {
    console.error(err);
    process.exit(1);
  });
