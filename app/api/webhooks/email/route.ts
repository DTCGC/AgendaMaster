/**
 * Inbound Email Webhook (Resend)
 *
 * Receives `email.received` webhook events from Resend when someone
 * emails info@coquitlamgavel.com. Fetches the full email body via the
 * Resend Receiving API, wraps it in branded HTML, and forwards it to
 * the club's Gmail account (coquitlamgavel@gmail.com) with the original
 * sender set as Reply-To for seamless correspondence.
 */
import { NextResponse } from 'next/server';
import { quietlySendEmail } from '@/lib/email';

const RESEND_API_KEY = process.env.RESEND_API_KEY;

/**
 * Fetches the full content of a *received* (inbound) email from Resend.
 * 
 * IMPORTANT: The SDK's `resend.emails.get()` only works for SENT (outbound) emails
 * and hits `GET /emails/{id}`. Inbound emails live at a separate endpoint:
 * `GET /emails/receiving/{id}` — which returns `html`, `text`, and `raw` fields.
 * 
 * @see https://resend.com/docs/api-reference/emails/retrieve-received-email
 */
async function fetchReceivedEmail(emailId: string): Promise<{ html: string; text: string } | null> {
  if (!RESEND_API_KEY) return null;

  try {
    const res = await fetch(`https://api.resend.com/emails/receiving/${emailId}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
    });

    if (!res.ok) {
      const errorBody = await res.text();
      console.error(`[Webhook] Resend API error (${res.status}) fetching received email ${emailId}:`, errorBody);
      return null;
    }

    const data = await res.json();
    return {
      html: data.html || '',
      text: data.text || '',
    };
  } catch (err) {
    console.error('[Webhook] Network error fetching received email:', err);
    return null;
  }
}

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

    // The webhook payload only contains metadata (from, subject, email_id).
    // We must fetch the full email via the RECEIVING endpoint to get `text` and `html`.
    if (email_id) {
      const body = await fetchReceivedEmail(email_id);
      if (body) {
        text = body.text;
        html = body.html;
      }
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
