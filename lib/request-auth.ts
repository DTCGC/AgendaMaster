/**
 * Authentication for the machine-to-machine endpoints: the Droplet's cron
 * jobs (shared bearer secret) and Resend's inbound-email webhook (Svix
 * signature). Comparisons are constant-time so the secret can't be guessed
 * byte by byte from response timings.
 */
import { createHmac, timingSafeEqual } from 'node:crypto'

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a)
  const right = Buffer.from(b)
  return left.length === right.length && timingSafeEqual(left, right)
}

/** True when the request carries `Authorization: Bearer $CRON_SECRET`. */
export function hasCronSecret(request: Request): boolean {
  const secret = process.env.CRON_SECRET
  const header = request.headers.get('Authorization') ?? ''
  return !!secret && safeEqual(header, `Bearer ${secret}`)
}

/** Webhook deliveries older (or newer) than this are rejected as replays. */
const SIGNATURE_TOLERANCE_SECONDS = 5 * 60

/**
 * Verifies a Svix-signed webhook (the scheme Resend uses).
 *
 * Svix signs `${svix-id}.${svix-timestamp}.${rawBody}` with HMAC-SHA256,
 * keyed by the base64 part of the `whsec_…` secret, and sends one or more
 * space-separated `v1,<base64 signature>` entries in `svix-signature`.
 *
 * @see https://docs.svix.com/receiving/verifying-payloads/how-manual
 */
export function verifySvixSignature(
  rawBody: string,
  headers: Headers,
  secret: string,
  nowSeconds: number = Math.floor(Date.now() / 1000)
): boolean {
  const id = headers.get('svix-id')
  const timestamp = headers.get('svix-timestamp')
  const signatures = headers.get('svix-signature')
  if (!id || !timestamp || !signatures) return false

  const sentAt = Number(timestamp)
  if (!Number.isFinite(sentAt) || Math.abs(nowSeconds - sentAt) > SIGNATURE_TOLERANCE_SECONDS) return false

  const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64')
  const expected = createHmac('sha256', key).update(`${id}.${timestamp}.${rawBody}`).digest('base64')

  return signatures.split(' ').some((entry) => {
    const [version, signature] = entry.split(',')
    return version === 'v1' && !!signature && safeEqual(signature, expected)
  })
}
