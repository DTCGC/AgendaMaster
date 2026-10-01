/**
 * The meeting calendar's rules: Fridays at 6:45 PM, no July or August, never
 * in the past. Runs in the host's local time, like the app (whose PM2 config
 * pins TZ to Pacific).
 */
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import { upcomingMeetingStarts, meetingStartFor, toYmd, isMeetingDay } from '@/lib/meeting-schedule'

describe('upcomingMeetingStarts', () => {
  test('only Fridays at 6:45 PM, never in July or August', () => {
    const starts = upcomingMeetingStarts(new Date(2026, 5, 1), 20) // from June 1
    assert.equal(starts.length, 20)
    for (const s of starts) {
      assert.equal(s.getDay(), 5)
      assert.equal(s.getHours(), 18)
      assert.equal(s.getMinutes(), 45)
      assert.ok(s.getMonth() !== 6 && s.getMonth() !== 7, `${s.toDateString()} is in the summer break`)
    }
  })

  test("skips today's meeting once it has started", () => {
    const fridayEvening = new Date(2026, 9, 2, 19, 0) // Fri Oct 2, 7:00 PM
    assert.equal(toYmd(upcomingMeetingStarts(fridayEvening, 1)[0]), '2026-10-09')
    const fridayMorning = new Date(2026, 9, 2, 9, 0)
    assert.equal(toYmd(upcomingMeetingStarts(fridayMorning, 1)[0]), '2026-10-02')
  })
})

describe('meetingStartFor', () => {
  test('round-trips with toYmd at 6:45 PM', () => {
    const start = meetingStartFor('2026-10-02')!
    assert.equal(toYmd(start), '2026-10-02')
    assert.equal(start.getHours(), 18)
    assert.equal(start.getMinutes(), 45)
    assert.ok(isMeetingDay(start))
  })

  test('rejects malformed or impossible dates', () => {
    assert.equal(meetingStartFor('2026-02-30'), null)
    assert.equal(meetingStartFor('Oct 2'), null)
    assert.equal(meetingStartFor('2026-10-02T00:00:00Z'), null)
  })
})
