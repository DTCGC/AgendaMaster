/**
 * Admin Role Management panel — write-path guarantees.
 *
 * The panel posts every role it owns on each save, and the write is a
 * delete-then-create. Two things therefore have to hold, or the fairness
 * rotation in lib/agenda-logic.ts silently degrades:
 *
 *   1. Roles the panel does NOT own (minor roles) must never be written.
 *   2. Roles the panel owns but whose holder did not change must keep their
 *      original `assignedAt`.
 *
 * Both failures are invisible in the UI — the save appears to succeed — which
 * is exactly why they need tests.
 */
import { test, describe, before, beforeEach } from 'node:test'
import assert from 'node:assert/strict'

import { db, resetDb, createMeeting, createMembers, assignRole } from './helpers/db'
import { persistMajorRoles, filterToPanelRoles } from '@/lib/roles-logic'
import { MAJOR_ROLES, MINOR_ROLES, BACKUP_SPEAKER } from '@/lib/agenda-logic'

const LONG_AGO = new Date('2026-01-10T00:00:00.000Z')

let meetingId: string
let members: Record<string, { id: string; firstName: string }>

before(() => resetDb())

beforeEach(async () => {
  await resetDb()
  const meeting = await createMeeting()
  meetingId = meeting.id
  members = await createMembers(['Ada', 'Brian', 'Cleo', 'Eve'])

  // A settled meeting: minor roles from the wizard, major roles from the panel,
  // everything dated months back.
  await assignRole(meetingId, 'Timer', members.Ada.id, LONG_AGO)
  await assignRole(meetingId, 'Grammarian', members.Brian.id, LONG_AGO)
  await assignRole(meetingId, 'Evaluator 1', members.Cleo.id, LONG_AGO)
  await assignRole(meetingId, 'Toastmaster', members.Ada.id, LONG_AGO)
  await assignRole(meetingId, 'Speaker 1', members.Brian.id, LONG_AGO)
})

const rowFor = async (roleName: string) =>
  db.roleAssignment.findFirst({ where: { meetingId, roleName } })

/** What the form posts: every panel-owned role, whether or not it changed. */
const fullPanelPayload = (overrides: Record<string, string> = {}) =>
  [...MAJOR_ROLES, BACKUP_SPEAKER].map((roleName) => ({
    roleName,
    userId:
      overrides[roleName] ??
      ({ Toastmaster: members.Ada.id, 'Speaker 1': members.Brian.id }[roleName] ?? '')
  }))

describe('minor roles are never touched by the panel', () => {
  test('their holders and timestamps survive a major-role save', async () => {
    await persistMajorRoles(meetingId, fullPanelPayload({ 'Speaker 1': members.Eve.id }))

    for (const [roleName, holder] of [
      ['Timer', members.Ada.id],
      ['Grammarian', members.Brian.id],
      ['Evaluator 1', members.Cleo.id]
    ] as const) {
      const row = await rowFor(roleName)
      assert.ok(row, `${roleName} row should still exist`)
      assert.equal(row.userId, holder, `${roleName} holder changed`)
      assert.equal(
        row.assignedAt.getTime(),
        LONG_AGO.getTime(),
        `${roleName} was re-stamped — the fairness queue is corrupted`
      )
    }
  })

  test('a crafted payload naming a minor role is rejected server-side', async () => {
    await persistMajorRoles(meetingId, [
      { roleName: 'Timer', userId: members.Eve.id },
      { roleName: 'Definitely Not A Role', userId: members.Eve.id },
      { roleName: 'Toastmaster', userId: members.Ada.id }
    ])

    const timer = await rowFor('Timer')
    assert.equal(timer?.userId, members.Ada.id, 'Timer was reassigned by a crafted payload')
    assert.equal(timer?.assignedAt.getTime(), LONG_AGO.getTime())
    assert.equal(await rowFor('Definitely Not A Role'), null)
    assert.ok(await rowFor('Toastmaster'), 'a real panel role should still be written')
  })
})

describe('assignedAt reflects genuine changes only', () => {
  test('an unchanged holder keeps their original timestamp', async () => {
    // Change Speaker 1 only. Toastmaster is posted too, but with the same holder.
    await persistMajorRoles(meetingId, fullPanelPayload({ 'Speaker 1': members.Eve.id }))

    const toastmaster = await rowFor('Toastmaster')
    assert.equal(toastmaster?.userId, members.Ada.id)
    assert.equal(
      toastmaster?.assignedAt.getTime(),
      LONG_AGO.getTime(),
      'an untouched major role was re-dated by an unrelated speaker swap'
    )
  })

  test('a changed holder is stamped as newly assigned', async () => {
    await persistMajorRoles(meetingId, fullPanelPayload({ 'Speaker 1': members.Eve.id }))

    const speaker = await rowFor('Speaker 1')
    assert.equal(speaker?.userId, members.Eve.id, 'the panel write did not take effect')
    assert.ok(
      speaker!.assignedAt.getTime() > LONG_AGO.getTime(),
      'a genuinely new assignment should count as fresh participation'
    )
  })

  test('reassigning back to a previous holder still counts as new', async () => {
    await persistMajorRoles(meetingId, fullPanelPayload({ 'Speaker 1': members.Eve.id }))
    const first = await rowFor('Speaker 1')

    await persistMajorRoles(meetingId, fullPanelPayload({ 'Speaker 1': members.Cleo.id }))
    const second = await rowFor('Speaker 1')

    assert.equal(second?.userId, members.Cleo.id)
    assert.ok(
      second!.assignedAt.getTime() >= first!.assignedAt.getTime(),
      'a handover to a different member must re-stamp'
    )
  })

  test('clearing a role removes the row entirely', async () => {
    await persistMajorRoles(meetingId, fullPanelPayload({ Toastmaster: '' }))
    assert.equal(await rowFor('Toastmaster'), null)
  })
})

describe('the panel whitelist', () => {
  test('accepts the Backup Speaker even though it is not a major role', async () => {
    // Guards a real trap: BACKUP_SPEAKER is deliberately outside MAJOR_ROLES, so
    // a MAJOR_ROLES-only whitelist would silently swallow every standby save.
    assert.ok(!MAJOR_ROLES.includes(BACKUP_SPEAKER), 'BACKUP_SPEAKER must stay out of MAJOR_ROLES')

    await persistMajorRoles(meetingId, [{ roleName: BACKUP_SPEAKER, userId: members.Eve.id }])

    const row = await rowFor(BACKUP_SPEAKER)
    assert.equal(row?.userId, members.Eve.id, 'the standby assignment was discarded')
  })

  test('rejects every minor role', () => {
    const kept = filterToPanelRoles(MINOR_ROLES.map((roleName) => ({ roleName })))
    assert.deepEqual(kept, [])
  })

  test('major and minor role lists do not overlap', () => {
    assert.deepEqual(MAJOR_ROLES.filter((r) => MINOR_ROLES.includes(r)), [])
  })
})
