/**
 * Backup Speaker — the "roleless title" contract.
 *
 * The standby only speaks if one of the three booked speakers drops out. If all
 * three turn up they never perform, and are given a real speaking slot at a
 * later meeting instead. Every downstream consumer must therefore treat the
 * holder as though they have no role at all.
 *
 * Four separate code paths independently ask "does this person hold a role?",
 * so each needs its own guarantee here.
 */
import { test, describe, before, beforeEach } from 'node:test'
import assert from 'node:assert/strict'

import { resetDb, createMeeting, createMembers, assignRole } from './helpers/db'
import { getAutoAssignments, MINOR_ROLES, MAJOR_ROLES, BACKUP_SPEAKER } from '@/lib/agenda-logic'

const ROSTER = ['Alice', 'Bob', 'Carl', 'Dana', 'Evan', 'Fay',
                'Gina', 'Hank', 'Iris', 'Jack', 'Kara', 'Liam']

let meetingId: string
let members: Record<string, { id: string; firstName: string }>

before(() => resetDb())

beforeEach(async () => {
  await resetDb()
  const meeting = await createMeeting()
  meetingId = meeting.id
  members = await createMembers(ROSTER)
})

const holders = (assignments: Record<string, { displayName: string } | null>) =>
  MINOR_ROLES.map((role) => assignments[role]?.displayName ?? null)

describe('the title does not consume its holder', () => {
  test('the standby is still given a minor role', async () => {
    await assignRole(meetingId, BACKUP_SPEAKER, members.Alice.id)

    const result = await getAutoAssignments(meetingId)

    assert.equal(result.backupSpeaker?.displayName, 'Alice')
    assert.ok(
      holders(result.assignments).includes('Alice'),
      'standby duty must not block a minor-role assignment'
    )
  })

  test('the standby is not given two minor roles', async () => {
    await assignRole(meetingId, BACKUP_SPEAKER, members.Alice.id)

    const result = await getAutoAssignments(meetingId)
    const timesAssigned = holders(result.assignments).filter((n) => n === 'Alice').length

    assert.equal(timesAssigned, 1)
  })

  test('a standby with no minor role stays on the attendance list', async () => {
    // Fill all nine minor roles with other members, leaving the standby spare.
    const others = ['Bob', 'Carl', 'Dana', 'Evan', 'Fay', 'Gina', 'Hank', 'Iris', 'Jack']
    for (let i = 0; i < MINOR_ROLES.length; i++) {
      await assignRole(meetingId, MINOR_ROLES[i], members[others[i]].id)
    }
    await assignRole(meetingId, BACKUP_SPEAKER, members.Kara.id)

    const result = await getAutoAssignments(meetingId)

    assert.ok(
      result.unassigned.some((u) => u.displayName === 'Kara'),
      'a standby holding nothing else is an attendee without a role'
    )
  })
})

describe('standby duty is not participation', () => {
  test('a fresh standby row does not lower priority', async () => {
    // Bob..Jack each hold a real minor role dated today. Alice, Kara and Liam
    // hold only standby rows, also dated today. If standby counted as
    // participation all twelve would rank together; instead the three standbys
    // must take the first slots, because they have effectively never served.
    const served = ['Bob', 'Carl', 'Dana', 'Evan', 'Fay', 'Gina', 'Hank', 'Iris', 'Jack']
    const past = await createMeeting(new Date('2026-08-01'))
    for (let i = 0; i < MINOR_ROLES.length; i++) {
      await assignRole(past.id, MINOR_ROLES[i], members[served[i]].id)
    }
    for (const name of ['Alice', 'Kara', 'Liam']) {
      await assignRole(past.id, BACKUP_SPEAKER, members[name].id)
    }

    const result = await getAutoAssignments(meetingId)
    const firstThree = holders(result.assignments).slice(0, 3)

    for (const name of ['Alice', 'Kara', 'Liam']) {
      assert.ok(
        firstThree.includes(name),
        `${name} only ever sat standby and should rank first — got ${firstThree.join(', ')}`
      )
    }
  })
})

describe('role list membership', () => {
  test('BACKUP_SPEAKER belongs to neither role list', () => {
    // In MAJOR_ROLES it would render as a real slot and exclude its holder from
    // minor roles; in MINOR_ROLES the heuristic would hand it out automatically.
    assert.ok(!MAJOR_ROLES.includes(BACKUP_SPEAKER))
    assert.ok(!MINOR_ROLES.includes(BACKUP_SPEAKER))
  })
})
