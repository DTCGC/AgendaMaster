/**
 * Meeting Schedule Rules
 *
 * Club meetings are Fridays at 6:45 PM, with July and August off. Dates are
 * built in server-local time, which ecosystem.config.js pins to Pacific (TZ),
 * so local hours are the club's hours.
 */

/** Standard meeting start: 6:45 PM local. */
export const MEETING_START_HOUR = 18
export const MEETING_START_MINUTE = 45

/** "2026-10-02" for a local date — the format the calendar posts back. */
export function toYmd(date: Date): string {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-')
}

/** The 6:45 PM start of the meeting on a "YYYY-MM-DD" day, or null if malformed. */
export function meetingStartFor(ymd: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd)
  if (!match) return null
  const [, y, m, d] = match.map(Number)
  const start = new Date(y, m - 1, d, MEETING_START_HOUR, MEETING_START_MINUTE, 0, 0)
  return start.getMonth() === m - 1 ? start : null
}

/** True for a Friday outside the July/August break. */
export function isMeetingDay(date: Date): boolean {
  const month = date.getMonth()
  return date.getDay() === 5 && month !== 6 && month !== 7
}

/**
 * The next `count` meeting starts after `now`: Fridays at 6:45 PM, skipping
 * July and August and any Friday whose start has already passed.
 */
export function upcomingMeetingStarts(now: Date = new Date(), count = 20): Date[] {
  const starts: Date[] = []
  for (let i = 0; i < 366 && starts.length < count; i++) {
    const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i, MEETING_START_HOUR, MEETING_START_MINUTE)
    if (isMeetingDay(day) && day.getTime() > now.getTime()) starts.push(day)
  }
  return starts
}
