/**
 * Inbound Email Webhook (Resend)
 *
 * Receives `email.received` webhook events from Resend when someone
 * emails info@coquitlamgavel.com. Fetches the full email body via the
 * Resend Receiving API, and forwards it unchanged to the club's Gmail
 * account (coquitlamgavel@gmail.com) under the original sender's name,
 * with their address as Reply-To for seamless correspondence.
 *
 * Every delivery must carry a valid Svix signature made with
 * RESEND_WEBHOOK_SECRET (Resend dashboard → Webhooks → signing secret).
 * Without that check anyone could POST here and make the server send mail.
 */
import { NextResponse } from 'next/server';
import { sendEmail, FROM_EMAIL, FROM_ADDRESS } from '@/lib/email';
import { CLUB_GOOGLE_EMAIL } from '@/lib/club-google';
import { escapeHtml } from '@/lib/html';
import { verifySvixSignature } from '@/lib/request-auth';

const RESEND_API_KEY = process.env.RESEND_API_KEY;

/** Where inbound club mail gets forwarded. */
const CLUB_INBOX = CLUB_GOOGLE_EMAIL;

/**
 * Addresses that must never be forwarded FROM.
 *
 * Without this guard, mail loops are trivial to trigger: the forward is sent
 * from info@coquitlamgavel.com, which is itself the Resend inbound address.
 * Any bounce, vacation auto-reply, or reply sent back to info@ would re-enter
 * this webhook and be forwarded again, indefinitely.
 */
const LOOP_GUARD_ADDRESSES = [CLUB_INBOX, 'info@coquitlamgavel.com', FROM_ADDRESS.toLowerCase()];

/** Extracts the bare address from a "Display Name <addr@host>" header value. */
function extractAddress(from: string): string {
  const match = from.match(/<([^>]+)>/);
  return (match ? match[1] : from).trim().toLowerCase();
}

/** The display name of a "Display Name <addr@host>" header value ("" when there is none). */
function displayNameOf(from: string): string {
  const match = from.match(/^\s*"?([^"<]*?)"?\s*</);
  return match ? match[1].trim() : '';
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

export async function POST(req: Request) {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) {
    console.error('[Webhook] RESEND_WEBHOOK_SECRET is not set; refusing unverifiable delivery.');
    return NextResponse.json({ error: 'Webhook not configured' }, { status: 503 });
  }

  const rawBody = await req.text();
  if (!verifySvixSignature(rawBody, req.headers, secret)) {
    console.warn('[Webhook] Rejected a delivery with a missing or invalid signature.');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  try {
    const payload = JSON.parse(rawBody);

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

    // Delivered as the original message, not wrapped in a forwarding notice:
    // the inbox shows the sender's name and their subject, and Reply goes to
    // them. Only the address it comes from is ours (it has to be: Resend only
    // sends from verified domains, and receiving mail must pass DMARC).
    const forwardedHtml = `${rawNotice}${html || (text ? `<pre style="white-space: pre-wrap; font-family: inherit;">${escapeHtml(text)}</pre>` : '<em>No content provided or failed to retrieve body.</em>')}`;

    await sendEmail(
      CLUB_INBOX,
      subject || '(no subject)',
      forwardedHtml,
      { replyTo: from, fromName: displayNameOf(from) || senderAddress }
    );

    console.log(`✓ Successfully forwarded inbound email from ${from} (sent as ${FROM_EMAIL})`);
    return NextResponse.json({ success: true });

  } catch (error) {
    console.error('Webhook processing error:', error);
    // Returning a 500 signals to Resend that it should retry the webhook delivery later
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
