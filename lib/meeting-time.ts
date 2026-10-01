/**
 * Meeting Date Formatting
 *
 * Meetings are stored as UTC instants of their 6:45 PM Pacific start. Every
 * date shown to people goes through these helpers with the club's timezone
 * spelled out, so the output is right whatever timezone the server runs in
 * (ecosystem.config.js also pins TZ, for the date arithmetic in
 * app/actions/calendar.ts and lib/agenda-sheet.ts).
 */

export const CLUB_TIMEZONE = 'America/Vancouver'

/** "Friday, October 2, 2026" */
export function formatMeetingDateLong(date: Date): string {
  return date.toLocaleDateString('en-US', {
    timeZone: CLUB_TIMEZONE, weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  })
}

/** "Oct 2, 2026" */
export function formatMeetingDate(date: Date): string {
  return date.toLocaleDateString('en-US', {
    timeZone: CLUB_TIMEZONE, month: 'short', day: 'numeric', year: 'numeric',
  })
}

/** "Oct 2" */
export function formatMeetingDateShort(date: Date): string {
  return date.toLocaleDateString('en-US', { timeZone: CLUB_TIMEZONE, month: 'short', day: 'numeric' })
}

/** "10/02" — the agenda sheet's title format. */
export function formatMeetingMonthDay(date: Date): string {
  return date.toLocaleDateString('en-US', { timeZone: CLUB_TIMEZONE, month: '2-digit', day: '2-digit' })
}
