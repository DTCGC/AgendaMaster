/**
 * Archival only ever touches meetings that actually took place.
 *
 * A meeting disabled on the calendar keeps its admin-set major roles, but it
 * never happened: it must stay CANCELLED rather than be archived as a record.
 */
import { test, before } from 'node:test'
import assert from 'node:assert/strict'

import { db, resetDb, createMeeting, createMembers, assignRole } from './helpers/db'
import { archivePassedMeetings } from '@/lib/archival'

before(() => resetDb())

test('a cancelled meeting with roles is not archived once its date passes', async () => {
  const members = await createMembers(['Ada', 'Brian'])
  const weeksAgo = (n: number) => new Date(Date.now() - n * 7 * 24 * 3600 * 1000)
  const held = await createMeeting(weeksAgo(2))
  const cancelled = await createMeeting(weeksAgo(1))
  await assignRole(cancelled.id, 'Toastmaster', members.Ada.id)
  await assignRole(cancelled.id, 'Speaker 1', members.Brian.id)
  await db.meeting.update({ where: { id: cancelled.id }, data: { status: 'CANCELLED' } })

  const { count } = await archivePassedMeetings()

  assert.equal(count, 1)
  assert.equal((await db.meeting.findUnique({ where: { id: held.id } }))?.status, 'ARCHIVED')
  assert.equal((await db.meeting.findUnique({ where: { id: cancelled.id } }))?.status, 'CANCELLED')
})
