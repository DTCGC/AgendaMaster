/**
 * Meeting Archival Module
 *
 * Provides the logic for transitioning meetings from SCHEDULED → ARCHIVED
 * after they've concluded. Called by the cron endpoint (POST /api/cron/archive)
 * which runs every Friday at 9:00 PM via a system crontab on the Droplet.
 */

import { db } from './db'

/**
 * Meetings are stored at their 6:45 PM start, and end at 8:30 PM — 105 minutes later.
 * The agenda/role editors stay open until then, so admins and the Toastmaster can
 * still make onsite changes while the meeting is running.
 */
const EDIT_WINDOW_MS = 105 * 60 * 1000

/** Earliest meeting date that is still editable right now (see EDIT_WINDOW_MS). */
export function editableMeetingsSince(): Date {
  return new Date(Date.now() - EDIT_WINDOW_MS)
}

/**
 * Meetings stay on the dashboard for 2h15m after their 6:45 PM start — until
 * 9:00 PM, when the cron archives them. Both are offsets from the stored
 * start instant, so neither depends on the server's timezone.
 */
export const ARCHIVE_BUFFER_MS = (2 * 60 + 15) * 60 * 1000

/** Earliest meeting date still shown as "upcoming" right now (see ARCHIVE_BUFFER_MS). */
export function visibleMeetingsSince(): Date {
  return new Date(Date.now() - ARCHIVE_BUFFER_MS)
}

/**
 * Archives all meetings whose 9:00 PM archival threshold has passed.
 *
 * @returns Object with `count` — the number of meetings archived in this run.
 */
export async function archivePassedMeetings() {
  const result = await db.meeting.updateMany({
    where: {
      status: 'SCHEDULED',
      date: { lt: visibleMeetingsSince() },
    },
    data: { status: 'ARCHIVED' },
  })

  return { count: result.count }
}
