/**
 * Who may edit a meeting's agenda — the server-side check behind the roster
 * save and the create-sheet-and-email pipeline.
 *
 * The /agenda/create page hides the wizard from everyone else, but server
 * actions are public POST endpoints, so the page is not a security boundary.
 * When this rule breaks, any member can rewrite any roster or email the whole
 * club, and nothing in the UI shows it.
 */
import { test, describe, beforeEach } from 'node:test'
import assert from 'node:assert/strict'

import { db, resetDb, createMeeting, createMembers, assignRole } from './helpers/db'
import { meetingEditDenial, MEETING_LOCKED, NOT_A_MEMBER, NOT_THE_TOASTMASTER } from '@/lib/meeting-access'

const NEXT_WEEK = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)

let meetingId: string
let members: Record<string, { id: string; firstName: string }>

beforeEach(async () => {
  await resetDb()
  meetingId = (await createMeeting(NEXT_WEEK)).id
  members = await createMembers(['Tess', 'Otto'])
  await assignRole(meetingId, 'Toastmaster', members.Tess.id)
})

describe('meetingEditDenial', () => {
  test("allows the meeting's own Toastmaster", async () => {
    assert.equal(await meetingEditDenial({ role: 'MEMBER', dbId: members.Tess.id }, meetingId), null)
  })

  test('allows an admin', async () => {
    assert.equal(await meetingEditDenial({ role: 'ADMIN', dbId: 'admin-id' }, meetingId), null)
  })

  test('refuses any other member', async () => {
    assert.equal(await meetingEditDenial({ role: 'MEMBER', dbId: members.Otto.id }, meetingId), NOT_THE_TOASTMASTER)
  })

  test('refuses pending, incomplete and signed-out callers — even the Toastmaster id', async () => {
    for (const role of ['PENDING', 'INCOMPLETE', 'DELETED']) {
      assert.equal(await meetingEditDenial({ role, dbId: members.Tess.id }, meetingId), NOT_A_MEMBER)
    }
    assert.equal(await meetingEditDenial(undefined, meetingId), NOT_A_MEMBER)
  })

  test('refuses a meeting with no Toastmaster to a member', async () => {
    await db.roleAssignment.deleteMany({ where: { meetingId } })
    assert.equal(await meetingEditDenial({ role: 'MEMBER', dbId: members.Tess.id }, meetingId), NOT_THE_TOASTMASTER)
  })

  test('locks cancelled and archived meetings, even for admins', async () => {
    for (const status of ['CANCELLED', 'ARCHIVED']) {
      await db.meeting.update({ where: { id: meetingId }, data: { status } })
      assert.equal(await meetingEditDenial({ role: 'ADMIN' }, meetingId), MEETING_LOCKED)
      assert.equal(await meetingEditDenial({ role: 'MEMBER', dbId: members.Tess.id }, meetingId), MEETING_LOCKED)
    }
  })

  test('locks a meeting once its edit window has closed', async () => {
    await db.meeting.update({ where: { id: meetingId }, data: { date: new Date('2026-01-09T02:45:00Z') } })
    assert.equal(await meetingEditDenial({ role: 'MEMBER', dbId: members.Tess.id }, meetingId), MEETING_LOCKED)
  })
})
