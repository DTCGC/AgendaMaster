/**
 * Resend Daily Quota Tracking
 *
 * Resend's free plan allows 100 emails per UTC day, and it counts every
 * recipient (to, cc and bcc each count once) plus every email received at the
 * club's inbound address. A broadcast that runs out partway through reaches
 * some of the club and not the rest, so the broadcast checks the remaining
 * allowance up front and refuses rather than half-sending.
 *
 * Resend reports the day's usage so far in the `x-resend-daily-quota` header
 * of every response to a free-plan account. The latest reading is kept in the
 * Settings table — not process memory — because PM2 runs several workers and
 * each one sends mail. Between readings (a fresh day, a send whose response
 * lacked the header) usage is estimated by adding what this app sent.
 *
 * The estimate cannot see mail sent outside this app on the same Resend
 * account, so it is a guard against the common failure, not a guarantee; the
 * broadcast also stops cleanly if Resend reports the quota exhausted mid-send.
 *
 * RESEND_DAILY_LIMIT (optional) overrides the limit; set it to 0 on a paid
 * plan, which has no daily quota.
 */
import { db } from '@/lib/db'

const USAGE_KEY = 'resendDailyUsage'

const FREE_PLAN_DAILY_LIMIT = 100

/** The daily limit, or null when there is none. */
export function dailyLimit(): number | null {
  const configured = process.env.RESEND_DAILY_LIMIT
  if (configured === undefined || configured.trim() === '') return FREE_PLAN_DAILY_LIMIT
  const n = Number(configured)
  if (!Number.isFinite(n) || n < 0) return FREE_PLAN_DAILY_LIMIT
  return n === 0 ? null : Math.floor(n)
}

/** Resend's quota day: "2026-10-03" in UTC. */
export function utcDay(date = new Date()): string {
  return date.toISOString().slice(0, 10)
}

/** When the current quota day ends (midnight UTC). */
export function quotaResetsAt(now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1))
}

type Usage = { day: string; used: number }

async function readUsage(): Promise<Usage | null> {
  const row = await db.settings.findUnique({ where: { key: USAGE_KEY } })
  if (!row) return null
  try {
    const parsed = JSON.parse(row.value) as Usage
    return typeof parsed.day === 'string' && Number.isFinite(parsed.used) ? parsed : null
  } catch {
    return null
  }
}

/** Emails used today as far as this app knows (0 when nothing has been recorded today). */
export async function usedToday(now = new Date()): Promise<number> {
  const usage = await readUsage()
  return usage && usage.day === utcDay(now) ? usage.used : 0
}

/** Emails left today, or null when the plan has no daily limit. */
export async function remainingToday(now = new Date()): Promise<number | null> {
  const limit = dailyLimit()
  if (limit === null) return null
  return Math.max(0, limit - (await usedToday(now)))
}

/**
 * Records a successful send. `headers` is the Resend response's headers;
 * `counted` is how many quota units the send used (its recipient count).
 * Never throws — bookkeeping must not turn a delivered email into a failure.
 */
export async function recordUsage(headers: Record<string, string> | null, counted: number, now = new Date()) {
  try {
    const header = headers?.['x-resend-daily-quota']
    const reported = header === undefined ? NaN : Number(header)
    const used = Number.isFinite(reported) ? reported : (await usedToday(now)) + counted
    const value = JSON.stringify({ day: utcDay(now), used } satisfies Usage)
    await db.settings.upsert({
      where: { key: USAGE_KEY },
      create: { key: USAGE_KEY, value },
      update: { value },
    })
  } catch (error) {
    console.error('Could not record Resend quota usage:', error)
  }
}
