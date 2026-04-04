import { db } from './db'

/**
 * Automatically archives passed meetings.
 * A meeting is archived if it is still 'SCHEDULED' but the current time
 * is past 9:00 PM on the Friday it was scheduled for.
 * 
 * Per spec, British Columbia is on permanent PDT (UTC-7).
 * Meetings are initialized at 6:45 PM (18:45).
 * 9:00 PM is 2 hours and 15 minutes (8100 seconds) after the meeting start.
 */
export async function archivePassedMeetings() {
  const now = new Date()
  
  // Archival threshold: 9:00 PM on the meeting date.
  // Since meeting.date is 18:45:00, 21:00:00 is 2 hours and 15 minutes later.
  const archivalBufferMs = (2 * 60 + 15) * 60 * 1000
  const thresholdDate = new Date(now.getTime() - archivalBufferMs)

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
