/**
 * Authentication for the machine-to-machine endpoints: the Droplet's cron
 * jobs (shared bearer secret). The comparison is constant-time so the secret
 * can't be guessed byte by byte from response timings.
 */
import { timingSafeEqual } from 'node:crypto'

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
