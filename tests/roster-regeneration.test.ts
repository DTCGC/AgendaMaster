/**
 * Roster preservation and deliberate regeneration.
 *
 * getAutoAssignments has two opposing jobs. Normally it must PRESERVE whatever
 * the Toastmaster last saved — re-deriving on every load is what used to
 * scramble finalized rosters when the wizard was reopened to make an update.
 * With `ignoreSavedMinorRoles` it must do the opposite and reshuffle.
 *
 * The reshuffle has a subtle failure mode worth pinning down: skipping the
 * restore step alone is not enough, because the saved holders would still count
 * as "already holding a role" and be filtered out of the eligible pool — the
 * reshuffle would exclude most of the club from its own reshuffle.
 */
import { test, describe, before, beforeEach } from 'node:test'
import assert from 'node:assert/strict'

import { db, resetDb, createMeeting, createMembers, assignRole } from './helpers/db'
import { getAutoAssignments, MINOR_ROLES, BACKUP_SPEAKER } from '@/lib/agenda-logic'

const ROSTER = ['Alice', 'Bob', 'Carl', 'Dana', 'Evan', 'Fay', 'Gina',
                'Hank', 'Iris', 'Jack', 'Kara', 'Liam', 'Mia', 'Noah']

// Deliberately the reverse of what the heuristic would pick, so a real
// reshuffle is unmistakable rather than a coincidence of ordering.
const SAVED = ['Noah', 'Mia', 'Liam', 'Kara', 'Jack', 'Iris', 'Hank', 'Gina', 'Fay']

let meetingId: string
let members: Record<string, { id: string; firstName: string }>

before(() => resetDb())

beforeEach(async () => {
  await resetDb()
  const meeting = await createMeeting()
  meetingId = meeting.id
  members = await createMembers(ROSTER)

  for (let i = 0; i < MINOR_ROLES.length; i++) {
    await assignRole(meetingId, MINOR_ROLES[i], members[SAVED[i]].id)
  }
  await assignRole(meetingId, 'Toastmaster', members.Alice.id)
  await assignRole(meetingId, 'Speaker 1', members.Bob.id)
  await assignRole(meetingId, BACKUP_SPEAKER, members.Carl.id)
})

const holders = (assignments: Record<string, { displayName: string } | null>) =>
  MINOR_ROLES.map((role) => assignments[role]?.displayName ?? null)

describe('a normal load preserves the saved roster', () => {
  test('every slot comes back exactly as saved', async () => {
    const result = await getAutoAssignments(meetingId)
    assert.deepEqual(holders(result.assignments), SAVED)
  })

  test('a departed member frees their slot for the heuristic', async () => {
    await db.user.update({
      where: { id: members.Fay.id },
      data: { role: 'DELETED' }
    })

    const result = await getAutoAssignments(meetingId)
    const refilled = result.assignments['Table Topics Evaluator 2']

    assert.ok(refilled, 'the vacated slot should be filled, not left empty')
    assert.notEqual(refilled.displayName, 'Fay')
  })
})

describe('a deliberate regeneration reshuffles', () => {
  test('the roster actually changes', async () => {
    const result = await getAutoAssignments(meetingId, { ignoreSavedMinorRoles: true })
    assert.notDeepEqual(holders(result.assignments), SAVED)
  })

  test('every slot is filled — the released holders return to the pool', async () => {
    // The regression this guards: without releasing the saved holders back into
    // the eligible pool, nearly the whole club is excluded and the reshuffle
    // returns a roster of empty slots.
    const result = await getAutoAssignments(meetingId, { ignoreSavedMinorRoles: true })
    assert.ok(
      holders(result.assignments).every((name) => name !== null),
      'reshuffle left empty slots'
    )
  })

  test('nobody ends up holding two minor roles', async () => {
    const result = await getAutoAssignments(meetingId, { ignoreSavedMinorRoles: true })
    const assigned = holders(result.assignments)
    assert.equal(new Set(assigned).size, assigned.length)
  })

  test('it is not persisted — a later load still returns the saved roster', async () => {
    await getAutoAssignments(meetingId, { ignoreSavedMinorRoles: true })

    const afterwards = await getAutoAssignments(meetingId)
    assert.deepEqual(
      holders(afterwards.assignments),
      SAVED,
      'regeneration must not write; the Toastmaster has to be able to back out'
    )
  })
})

describe('regeneration leaves other roles alone', () => {
  test('major-role holders are not pulled into minor roles', async () => {
    const result = await getAutoAssignments(meetingId, { ignoreSavedMinorRoles: true })
    const assigned = holders(result.assignments)

    assert.ok(!assigned.includes('Alice'), 'the Toastmaster was given a minor role')
    assert.ok(!assigned.includes('Bob'), 'Speaker 1 was given a minor role')
  })

  test('major roles and the standby are still reported', async () => {
    const result = await getAutoAssignments(meetingId, { ignoreSavedMinorRoles: true })

    assert.ok(
      result.preAssignedMajor.some(
        (a) => a.roleName === 'Speaker 1' && a.user?.displayName === 'Bob'
      )
    )
    assert.equal(result.backupSpeaker?.displayName, 'Carl')
  })

  test('the standby is still eligible during a reshuffle', async () => {
    const result = await getAutoAssignments(meetingId, { ignoreSavedMinorRoles: true })
    assert.ok(holders(result.assignments).includes('Carl'))
  })
})
