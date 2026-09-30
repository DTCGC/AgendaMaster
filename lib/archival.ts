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
 * Archives all meetings whose scheduled time has passed the 9:00 PM threshold.
 *
 * Meetings are stored with a start time of 6:45 PM (18:45). The archival
 * threshold is 2 hours and 15 minutes later (21:00 / 9:00 PM), allowing
 * the dashboard to keep the meeting visible for the duration of the evening.
 *
 * Per spec, BC is on permanent PDT (UTC-7) and meetings are always on Fridays.
 *
 * @returns Object with `count` — the number of meetings archived in this run.
 */
export async function archivePassedMeetings() {
  const now = new Date()
  
  // 2h15m = 135 minutes = 8,100,000 ms — the gap between 6:45 PM start and 9:00 PM archival
  const archivalBufferMs = (2 * 60 + 15) * 60 * 1000
  const thresholdDate = new Date(now.getTime() - archivalBufferMs)

  // Bulk-update all SCHEDULED meetings whose date is before the threshold
  const result = await db.meeting.updateMany({
    where: {
      status: 'SCHEDULED',
      date: {
        lt: thresholdDate,
      },
    },
    data: {
      status: 'ARCHIVED',
    },
  })

  return { count: result.count }
}
