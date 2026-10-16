/**
 * Minor role rotation — each role keeps its own clock.
 *
 * The rotation must answer "how long since this member was Filler Word
 * Counter?", not "how long since this member had any role?". With only the
 * second question, whoever had waited longest always landed in the first slot
 * (Sergeant at Arms) and nothing stopped a member doing the same job week
 * after week. These tests pin the per-role behaviour down, then run the
 * wizard over many simulated meetings to check that members actually cycle.
 */
import { test, describe, before, beforeEach } from 'node:test'
import assert from 'node:assert/strict'

import { db, resetDb, createMeeting, createMembers, assignRole } from './helpers/db'
import { getAutoAssignments, MINOR_ROLES } from '@/lib/agenda-logic'
import { minorRoleFamily } from '@/lib/roles'
import { planMinorRoles, buildRoleHistory } from '@/lib/minor-rotation'

const DAY = 24 * 60 * 60 * 1000
const NOW = Date.UTC(2026, 8, 4, 19)
const daysAgo = (n: number) => NOW - n * DAY

const person = (name: string) => ({ id: name, displayName: name })
/** { member: { roleName: meetingTime } } → RoleHistory */
const historyOf = (entries: Record<string, Record<string, number>>) =>
  buildRoleHistory(Object.entries(entries).flatMap(([userId, roles]) =>
    Object.entries(roles).map(([roleName, meetingTime]) => ({ userId, roleName, meetingTime }))))
const holderOf = (plan: ReturnType<typeof planMinorRoles<{ id: string; displayName: string }>>) =>
  Object.fromEntries(Object.entries(plan.assignments).map(([role, m]) => [role, m.id]))

describe('planning one meeting', () => {
  test('each member takes the role they have gone longest without', () => {
    const plan = planMinorRoles(
      ['Timer', 'Filler Word Counter'],
      [person('Ada'), person('Ben')],
      historyOf({
        Ada: { Timer: daysAgo(7), 'Filler Word Counter': daysAgo(70) },
        Ben: { Timer: daysAgo(70), 'Filler Word Counter': daysAgo(7) },
      }),
      NOW
    )
    assert.deepEqual(holderOf(plan), { Timer: 'Ben', 'Filler Word Counter': 'Ada' })
  })

  test('the numbered slots share one clock', () => {
    // Ada evaluated last week as Evaluator 1; Evaluator 3 is the same job.
    const plan = planMinorRoles(
      ['Grammarian', 'Evaluator 3'],
      [person('Ada'), person('Ben')],
      historyOf({ Ada: { 'Evaluator 1': daysAgo(7) }, Ben: { Grammarian: daysAgo(7) } }),
      NOW
    )
    assert.deepEqual(holderOf(plan), { Grammarian: 'Ada', 'Evaluator 3': 'Ben' })
  })

  test('filling the early slots never strands someone with a repeat', () => {
    // Slot by slot, Sergeant at Arms would go to Ada (she never did it) and
    // leave Ben the Timer role he did last week. As a whole, both avoid a repeat.
    const plan = planMinorRoles(
      ['Sergeant at Arms', 'Timer'],
      [person('Ada'), person('Ben')],
      historyOf({ Ada: { Timer: daysAgo(14) }, Ben: { Timer: daysAgo(7) } }),
      NOW
    )
    assert.deepEqual(holderOf(plan), { 'Sergeant at Arms': 'Ben', Timer: 'Ada' })
  })

  test('who sits out is decided by their last minor role of any kind', () => {
    const plan = planMinorRoles(
      ['Timer'],
      [person('Ada'), person('Ben'), person('Cy')],
      historyOf({ Ada: { Grammarian: daysAgo(7) }, Ben: { Timer: daysAgo(21) }, Cy: { 'Evaluator 2': daysAgo(14) } }),
      NOW
    )
    // Ben is the only one who has been Timer before, but he has waited longest overall.
    assert.deepEqual(holderOf(plan), { Timer: 'Ben' })
    assert.deepEqual(plan.unassigned.map((m) => m.id), ['Cy', 'Ada'])
  })

  test('with more roles than members, the last roles stay empty', () => {
    const plan = planMinorRoles(MINOR_ROLES, [person('Ada'), person('Ben')], new Map(), NOW)
    assert.deepEqual(Object.keys(plan.assignments).sort(), ['Sergeant at Arms', 'Timer'])
  })
})

describe('history read from the database', () => {
  let members: Record<string, { id: string; firstName: string }>

  before(() => resetDb())
  beforeEach(async () => {
    await resetDb()
    members = await createMembers(['Ada', 'Ben'])
  })

  const planFor = async (meetingId: string) =>
    (await getAutoAssignments(meetingId)).assignments

  test('is dated by the meeting, not by when the roster was saved', async () => {
    // The older meeting's roster was (re)saved last, so by save date it would
    // look like the recent one.
    const old = await createMeeting(new Date('2026-08-07T19:00:00Z'))
    const recent = await createMeeting(new Date('2026-08-28T19:00:00Z'))
    const savedLate = new Date('2026-09-01T00:00:00Z')
    const savedEarly = new Date('2026-08-01T00:00:00Z')
    await assignRole(old.id, 'Sergeant at Arms', members.Ben.id, savedLate)
    await assignRole(recent.id, 'Sergeant at Arms', members.Ada.id, savedEarly)
    await assignRole(old.id, 'Timer', members.Ada.id, savedLate)
    await assignRole(recent.id, 'Timer', members.Ben.id, savedEarly)

    const next = await createMeeting(new Date('2026-09-04T19:00:00Z'))
    const assignments = await planFor(next.id)
    assert.equal(assignments['Sergeant at Arms']?.displayName, 'Ben')
    assert.equal(assignments.Timer?.displayName, 'Ada')
  })

  test('ignores cancelled meetings and later meetings', async () => {
    const cancelled = await db.meeting.update({
      where: { id: (await createMeeting(new Date('2026-08-28T19:00:00Z'))).id },
      data: { status: 'CANCELLED' },
    })
    const later = await createMeeting(new Date('2026-09-11T19:00:00Z'))
    const held = await createMeeting(new Date('2026-08-21T19:00:00Z'))
    await assignRole(held.id, 'Sergeant at Arms', members.Ben.id)
    await assignRole(held.id, 'Timer', members.Ada.id)
    // Neither of these happened before the meeting being planned.
    await assignRole(cancelled.id, 'Sergeant at Arms', members.Ada.id)
    await assignRole(later.id, 'Sergeant at Arms', members.Ada.id)

    const next = await createMeeting(new Date('2026-09-04T19:00:00Z'))
    const assignments = await planFor(next.id)
    assert.equal(assignments['Sergeant at Arms']?.displayName, 'Ada')
    assert.equal(assignments.Timer?.displayName, 'Ben')
  })
})

describe('over many meetings', () => {
  before(() => resetDb())
  beforeEach(() => resetDb())

  /** Runs the wizard weekly, saving each roster; returns name → family per meeting. */
  async function simulate(names: string[], weeks: number) {
    await createMembers(names)
    const log: Map<string, string>[] = []
    for (let week = 0; week < weeks; week++) {
      const meeting = await createMeeting(new Date(Date.UTC(2026, 0, 2 + 7 * week, 19)))
      const { assignments } = await getAutoAssignments(meeting.id)
      const served = new Map<string, string>()
      for (const role of MINOR_ROLES) {
        const holder = assignments[role]
        assert.ok(holder, `week ${week}: ${role} was left empty`)
        await assignRole(meeting.id, role, holder.id)
        served.set(holder.displayName, minorRoleFamily(role))
      }
      log.push(served)
    }
    return log
  }

  const NINE = ['Ada', 'Ben', 'Cy', 'Dee', 'Eli', 'Fay', 'Gus', 'Hal', 'Ivy']
  const TWELVE = [...NINE, 'Jo', 'Kit', 'Lu']
  const slotsIn = (family: string) => MINOR_ROLES.filter((r) => minorRoleFamily(r) === family).length
  const families = [...new Set(MINOR_ROLES.map(minorRoleFamily))]

  function assertNoBackToBack(log: Map<string, string>[]) {
    for (let week = 1; week < log.length; week++) {
      for (const [name, family] of log[week]) {
        assert.notEqual(log[week - 1].get(name), family, `${name} was ${family} two meetings running (week ${week})`)
      }
    }
  }

  function countsFor(log: Map<string, string>[], name: string) {
    const counts = Object.fromEntries(families.map((f) => [f, 0]))
    for (const week of log) {
      const family = week.get(name)
      if (family) counts[family]++
    }
    return counts
  }

  test('nine members cycle through every role in exact proportion', async () => {
    // 18 meetings = two full cycles, so each member should do each job exactly
    // as often as it has slots: twice per single role, four Table Topics
    // evaluations, six evaluations.
    const log = await simulate(NINE, 18)
    assertNoBackToBack(log)
    for (const name of NINE) {
      const expected = Object.fromEntries(families.map((f) => [f, 2 * slotsIn(f)]))
      assert.deepEqual(countsFor(log, name), expected, `${name}'s roles were not evenly spread`)
    }
  })

  test('with twelve members everyone sits out equally and still cycles', async () => {
    // Three sit out each week. Everyone who served last week ties on their
    // latest stint, so this also guards against the same names winning that
    // tie (and a role) every single week.
    const log = await simulate(TWELVE, 36)
    assertNoBackToBack(log)
    for (const name of TWELVE) {
      const served = log.filter((week) => week.has(name)).length
      assert.equal(served, 27, `${name} served ${served} of 36 meetings, expected 27`)
      const expected = Object.fromEntries(families.map((f) => [f, 3 * slotsIn(f)]))
      assert.deepEqual(countsFor(log, name), expected, `${name}'s roles were not evenly spread`)
    }
  })
})
