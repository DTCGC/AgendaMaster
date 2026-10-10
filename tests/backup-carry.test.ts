/**
 * Backup Speaker carry-forward.
 *
 * Whoever is on standby at one meeting is given a random open Speaker 1-3 slot
 * at the next scheduled meeting. Changing the standby moves that slot with it,
 * and a meeting scheduled later still picks up the previous standby.
 */
import { test, describe, before, beforeEach } from 'node:test'
import assert from 'node:assert/strict'

import { db, resetDb, createMeeting, createMembers, assignRole } from './helpers/db'
import { persistMajorRoles, carryBackupInto, SPEAKER_SLOTS } from '@/lib/roles-logic'
import { BACKUP_SPEAKER } from '@/lib/roles'

let thisWeek: string
let nextWeek: string
let members: Record<string, { id: string; firstName: string }>

before(() => resetDb())

beforeEach(async () => {
  await resetDb()
  thisWeek = (await createMeeting(new Date('2026-10-17T01:45:00Z'))).id
  nextWeek = (await createMeeting(new Date('2026-10-24T01:45:00Z'))).id
  members = await createMembers(['Ada', 'Brian', 'Cleo', 'Dev', 'Eve'])
})

/** The panel's save: only the standby set, every other panel role empty. */
const setStandby = (meetingId: string, userId: string) =>
  persistMajorRoles(meetingId, [{ roleName: BACKUP_SPEAKER, userId }, { roleName: 'Speaker 1', userId: '' }])

const speakerSlotsOf = async (meetingId: string, userId: string) =>
  (await db.roleAssignment.findMany({ where: { meetingId, userId, roleName: { in: SPEAKER_SLOTS } } }))
    .map((r) => r.roleName)

describe('choosing a standby', () => {
  test('gives them a speaker slot at the next meeting', async () => {
    await setStandby(thisWeek, members.Ada.id)

    const slots = await speakerSlotsOf(nextWeek, members.Ada.id)
    assert.equal(slots.length, 1)
    assert.ok(SPEAKER_SLOTS.includes(slots[0]))
  })

  test('only ever uses an open slot', async () => {
    await assignRole(nextWeek, 'Speaker 1', members.Brian.id)
    await assignRole(nextWeek, 'Speaker 3', members.Cleo.id)
    await setStandby(thisWeek, members.Ada.id)

    assert.deepEqual(await speakerSlotsOf(nextWeek, members.Ada.id), ['Speaker 2'])
  })

  test('does nothing when every slot is taken', async () => {
    for (const [slot, name] of [['Speaker 1', 'Brian'], ['Speaker 2', 'Cleo'], ['Speaker 3', 'Dev']]) {
      await assignRole(nextWeek, slot, members[name].id)
    }
    await setStandby(thisWeek, members.Ada.id)

    assert.deepEqual(await speakerSlotsOf(nextWeek, members.Ada.id), [])
  })

  test('does not double-book someone who already has a role there', async () => {
    await assignRole(nextWeek, 'Toastmaster', members.Ada.id)
    await setStandby(thisWeek, members.Ada.id)

    assert.deepEqual(await speakerSlotsOf(nextWeek, members.Ada.id), [])
  })

  test('skips a cancelled meeting', async () => {
    await db.meeting.update({ where: { id: nextWeek }, data: { status: 'CANCELLED' } })
    const weekAfter = (await createMeeting(new Date('2026-10-31T01:45:00Z'))).id
    await setStandby(thisWeek, members.Ada.id)

    assert.deepEqual(await speakerSlotsOf(nextWeek, members.Ada.id), [])
    assert.equal((await speakerSlotsOf(weekAfter, members.Ada.id)).length, 1)
  })

  test('keeps Speaker 3 free while a guest speaker is set', async () => {
    await db.meeting.update({ where: { id: nextWeek }, data: { guestSpeakerName: 'Dr. Jane Doe' } })
    await assignRole(nextWeek, 'Speaker 1', members.Brian.id)
    await setStandby(thisWeek, members.Ada.id)

    assert.deepEqual(await speakerSlotsOf(nextWeek, members.Ada.id), ['Speaker 2'])
  })

  test('re-saving the same standby does not add a second slot', async () => {
    await setStandby(thisWeek, members.Ada.id)
    await setStandby(thisWeek, members.Ada.id)

    assert.equal((await speakerSlotsOf(nextWeek, members.Ada.id)).length, 1)
  })
})

describe('changing the standby', () => {
  test('moves the automatic slot to the new standby', async () => {
    await setStandby(thisWeek, members.Ada.id)
    await setStandby(thisWeek, members.Brian.id)

    assert.deepEqual(await speakerSlotsOf(nextWeek, members.Ada.id), [])
    assert.equal((await speakerSlotsOf(nextWeek, members.Brian.id)).length, 1)
  })

  test('clearing the standby takes the automatic slot back', async () => {
    await setStandby(thisWeek, members.Ada.id)
    await setStandby(thisWeek, '')

    assert.deepEqual(await speakerSlotsOf(nextWeek, members.Ada.id), [])
  })

  test('leaves a slot the admin gave the old standby by hand', async () => {
    await assignRole(nextWeek, 'Speaker 2', members.Ada.id, new Date('2026-09-01T00:00:00Z'))
    await setStandby(thisWeek, members.Ada.id)
    await setStandby(thisWeek, members.Brian.id)

    assert.deepEqual(await speakerSlotsOf(nextWeek, members.Ada.id), ['Speaker 2'])
  })

  test('the automatic slot survives a save of the next meeting that keeps it', async () => {
    await setStandby(thisWeek, members.Ada.id)
    const [slot] = await speakerSlotsOf(nextWeek, members.Ada.id)
    await persistMajorRoles(nextWeek, [{ roleName: slot, userId: members.Ada.id }])
    await setStandby(thisWeek, members.Brian.id)

    assert.deepEqual(await speakerSlotsOf(nextWeek, members.Ada.id), [], 'still recognised as automatic')
  })
})

describe('a meeting scheduled after the standby was chosen', () => {
  test('picks up the previous meeting\'s standby', async () => {
    await db.roleAssignment.deleteMany()
    await db.meeting.delete({ where: { id: nextWeek } })
    await setStandby(thisWeek, members.Ada.id)

    const later = (await createMeeting(new Date('2026-10-24T01:45:00Z'))).id
    await carryBackupInto(later)

    assert.equal((await speakerSlotsOf(later, members.Ada.id)).length, 1)
  })

  test('not when the standby was already carried to another meeting', async () => {
    await setStandby(thisWeek, members.Ada.id)
    // A meeting slotted in after the carry already happened.
    const between = (await createMeeting(new Date('2026-10-20T01:45:00Z'))).id
    await carryBackupInto(between)

    assert.deepEqual(await speakerSlotsOf(between, members.Ada.id), [])
  })
})
