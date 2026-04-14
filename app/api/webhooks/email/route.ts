import { NextResponse } from 'next/server';
import { quietlySendEmail } from '@/lib/email';
import { Resend } from 'resend';

// Initialize Resend client here to fetch full inbound email contents
const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

export async function POST(req: Request) {
  try {
    const payload = await req.json();

    // The payload shape for Resend Inbound Webhooks
    if (payload.type !== 'email.received' || !payload.data) {
      console.warn("[Webhook] Ignored non-received event or malformed payload.", payload.type);
      return NextResponse.json({ success: true });
    }

    const { from, subject, email_id } = payload.data;
    
    if (!from) {
      console.warn("[Webhook] Received inbound email webhook without 'from' field.");
      // Acknowledge to Resend to stop retries
      return NextResponse.json({ success: true }); 
    }

    let text = '';
    let html = '';

    // The webhook payload only contains metadata. 
    // We must fetch the full email to get the `text` and `html` content.
    if (email_id && resend) {
      const { data: emailDetails, error } = await resend.emails.get(email_id);
      if (error) {
        console.error("[Webhook] Failed to fetch email body for ID:", email_id, error);
      } else if (emailDetails) {
        text = emailDetails.text || '';
        html = emailDetails.html || '';
      }
    } else if (!resend) {
      console.warn("[Webhook] Resend client not initialized. Cannot fetch email body.");
    }

    const formattedSubject = `FWD: ${subject || 'No Subject'}`;
    const formattedHtml = `
      <div style="background: #f4f4f4; padding: 15px; border-radius: 5px; margin-bottom: 20px; font-family: sans-serif;">
        <p style="margin: 0; color: #666; font-size: 14px;"><strong>AgendaMaster Forwarding Service</strong></p>
        <p style="margin: 5px 0 0 0; color: #333;">You received a new message via the contact address.</p>
        <p style="margin: 5px 0 0 0; color: #333;"><strong>Original Sender:</strong> ${from}</p>
        <p style="margin: 5px 0 0 0; color: #772432; font-size: 12px;"><em>(Replying to this email will send your response directly to the original sender's address)</em></p>
      </div>
      <div style="padding: 10px; border-left: 4px solid #004165; background: #fff; color: #000;">
        ${html || (text ? `<pre style="white-space: pre-wrap; font-family: inherit;">${text}</pre>` : '<em>No content provided or failed to retrieve body.</em>')}
      </div>
    `;

    // Forward the email to the club's Gmail account, preserving the original sender as the Reply-To
    await quietlySendEmail(
      'coquitlamgavel@gmail.com',
      formattedSubject,
      formattedHtml,
      { reply_to: from }
    );

    console.log(`✓ Successfully forwarded inbound email from ${from}`);
    return NextResponse.json({ success: true });
    
  } catch (error) {
    console.error('Webhook processing error:', error);
    // Returning a 500 signals to Resend that it should retry the webhook delivery later
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
