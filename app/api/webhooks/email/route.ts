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
import { quietlySendEmail, FROM_EMAIL } from '@/lib/email';

const RESEND_API_KEY = process.env.RESEND_API_KEY;

/** Where inbound club mail gets forwarded. */
const CLUB_INBOX = 'coquitlamgavel@gmail.com';

/**
 * Addresses that must never be forwarded FROM.
 *
 * Without this guard, mail loops are trivial to trigger: the forward is sent
 * from info@coquitlamgavel.com, which is itself the Resend inbound address.
 * Any bounce, vacation auto-reply, or reply sent back to info@ would re-enter
 * this webhook and be forwarded again, indefinitely.
 */
const LOOP_GUARD_ADDRESSES = [CLUB_INBOX, 'info@coquitlamgavel.com'];

/** Extracts the bare address from a "Display Name <addr@host>" header value. */
function extractAddress(from: string): string {
  const match = from.match(/<([^>]+)>/);
  return (match ? match[1] : from).trim().toLowerCase();
}

/**
 * Fetches the full content of a *received* (inbound) email from Resend.
 *
 * IMPORTANT: The SDK's `resend.emails.get()` only works for SENT (outbound) emails
 * and hits `GET /emails/{id}`. Inbound emails live at a separate endpoint:
 * `GET /emails/receiving/{id}` — which returns `html`, `text`, and `raw` fields.
 *
 * `html` and `text` are both nullable on this endpoint. When neither is present
 * the body only exists in the `raw` MIME download, so we surface that URL to the
 * caller rather than silently forwarding an empty shell.
 *
 * @see https://resend.com/docs/api-reference/emails/retrieve-received-email
 */
async function fetchReceivedEmail(
  emailId: string
): Promise<{ html: string; text: string; rawUrl: string | null } | null> {
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
      rawUrl: data.raw?.download_url || null,
    };
  } catch (err) {
    console.error('[Webhook] Network error fetching received email:', err);
    return null;
  }
}

/**
 * Last-resort body recovery: downloads the raw RFC-822 message.
 *
 * Returned as preformatted text rather than parsed MIME — it is deliberately
 * ugly, because an unpolished but complete message beats a blank forward.
 */
async function fetchRawFallback(rawUrl: string): Promise<string> {
  try {
    const res = await fetch(rawUrl);
    if (!res.ok) {
      console.error(`[Webhook] Raw MIME download failed (${res.status}).`);
      return '';
    }
    return await res.text();
  } catch (err) {
    console.error('[Webhook] Network error downloading raw MIME:', err);
    return '';
  }
}

/** Escapes text destined for an HTML context. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
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

    // Drop anything originating from our own addresses before it can loop.
    const senderAddress = extractAddress(from);
    if (LOOP_GUARD_ADDRESSES.includes(senderAddress)) {
      console.warn(`[Webhook] Loop guard: refusing to forward mail from ${senderAddress}.`);
      return NextResponse.json({ success: true });
    }

    let text = '';
    let html = '';
    let rawUrl: string | null = null;

    // The webhook payload only contains metadata (from, subject, email_id).
    // We must fetch the full email via the RECEIVING endpoint to get `text` and `html`.
    if (email_id) {
      const body = await fetchReceivedEmail(email_id);
      if (body) {
        text = body.text;
        html = body.html;
        rawUrl = body.rawUrl;
      }
    }

    // Neither html nor text came back — fall back to the raw MIME source so the
    // exec team receives *something* readable instead of an empty wrapper.
    let rawNotice = '';
    if (!html && !text && rawUrl) {
      const raw = await fetchRawFallback(rawUrl);
      if (raw) {
        console.warn(`[Webhook] Body empty for ${email_id}; forwarded raw MIME instead.`);
        rawNotice = '<p style="margin:0 0 10px 0;color:#772432;font-size:12px;"><em>Formatted body unavailable — raw message source shown below.</em></p>';
        text = raw;
      }
    }

    if (!html && !text) {
      console.error(`[Webhook] No body recoverable for email ${email_id} from ${senderAddress}.`);
    }

    const formattedSubject = `FWD: ${subject || 'No Subject'}`;
    const formattedHtml = `
      <div style="background: #f4f4f4; padding: 15px; border-radius: 5px; margin-bottom: 20px; font-family: sans-serif;">
        <p style="margin: 0; color: #666; font-size: 14px;"><strong>AgendaMaster Forwarding Service</strong></p>
        <p style="margin: 5px 0 0 0; color: #333;">You received a new message via the contact address.</p>
        <p style="margin: 5px 0 0 0; color: #333;"><strong>Original Sender:</strong> ${escapeHtml(from)}</p>
        <p style="margin: 5px 0 0 0; color: #772432; font-size: 12px;"><em>(Replying to this email sends your response to ${escapeHtml(senderAddress)}. Your reply comes from the club Gmail account unless you have configured a "send as" alias.)</em></p>
      </div>
      <div style="padding: 10px; border-left: 4px solid #004165; background: #fff; color: #000;">
        ${rawNotice}
        ${html || (text ? `<pre style="white-space: pre-wrap; font-family: inherit;">${escapeHtml(text)}</pre>` : '<em>No content provided or failed to retrieve body.</em>')}
      </div>
    `;

    // Forward to the club's Gmail account, preserving the original sender as Reply-To.
    await quietlySendEmail(
      CLUB_INBOX,
      formattedSubject,
      formattedHtml,
      { replyTo: from }
    );

    console.log(`✓ Successfully forwarded inbound email from ${from} (sent as ${FROM_EMAIL})`);
    return NextResponse.json({ success: true });

  } catch (error) {
    console.error('Webhook processing error:', error);
    // Returning a 500 signals to Resend that it should retry the webhook delivery later
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
