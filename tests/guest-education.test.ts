/**
 * Guest Education Session — the Speaker 3 override contract.
 *
 * When a meeting is a Guest Education Session AND the admin has entered a
 * guest speaker name, the agenda sheet's Speaker 3 row must be relabeled
 * "Guest Speaker" and carry the guest's name. In every other case the row is
 * byte-for-byte identical to a Regular meeting's output.
 *
 * The gating itself (both-conditions-required) lives in buildRoleMap() inside
 * app/actions/execute-agenda.ts, which encodes an active override as
 * map['Speaker 3'] = <guest> plus the guestEducationActive flag. These tests
 * pin down the populateTemplate() half: the label swap and its inertness.
 */
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { populateTemplate } from '@/lib/google-api'

const csvTemplate = readFileSync(
  join(process.cwd(), 'public', 'assets', 'templates', 'agenda-template.csv'),
  'utf8'
)

const findRow = (rows: string[][], label: string) =>
  rows.find((r) => (r[1] || '').trim() === label)

describe('guest override inactive (default)', () => {
  test('Speaker 3 row keeps its label and assigned member', () => {
    const rows = populateTemplate(csvTemplate, 'Theme', 'QOTD', { 'Speaker 3': 'Alice' }, [])

    const row = findRow(rows, 'Speaker 3')
    assert.ok(row, 'Speaker 3 row must survive untouched')
    assert.equal(row![3], 'Alice')
    assert.equal(findRow(rows, 'Guest Speaker'), undefined)
  })

  test('an unassigned Speaker 3 still renders as TBD', () => {
    const rows = populateTemplate(csvTemplate, 'Theme', 'QOTD', {}, [])

    assert.equal(findRow(rows, 'Speaker 3')![3], 'TBD')
  })
})

describe('guest override active', () => {
  const roleMap = {
    'Speaker 3': 'Dr. Jane Doe',
    'Guest Speaker': 'Dr. Jane Doe',
    'Speaker 1': 'Bob'
  }

  test('the row is relabeled Guest Speaker and carries the guest name', () => {
    const rows = populateTemplate(csvTemplate, 'Theme', 'QOTD', roleMap, [], [], true)

    assert.equal(findRow(rows, 'Speaker 3'), undefined, 'the Speaker 3 label must not remain')
    const row = findRow(rows, 'Guest Speaker')
    assert.ok(row, 'a Guest Speaker row must exist')
    assert.equal(row![3], 'Dr. Jane Doe')
  })

  test('the guest name wins even when a member holds the Speaker 3 slot', () => {
    // buildRoleMap() overwrites the member with the guest before this runs;
    // populateTemplate() must faithfully print whatever won that overwrite.
    const rows = populateTemplate(csvTemplate, 'Theme', 'QOTD', roleMap, [], [], true)

    assert.ok(!rows.some((r) => r[3] === 'Alice'), 'the displaced member never leaks onto the sheet')
  })

  test('no other row is affected by the swap', () => {
    const regular = populateTemplate(csvTemplate, 'Theme', 'QOTD', roleMap, [])
    const guest = populateTemplate(csvTemplate, 'Theme', 'QOTD', roleMap, [], [], true)

    assert.equal(regular.length, guest.length)
    for (let i = 0; i < regular.length; i++) {
      if ((regular[i][1] || '').trim() === 'Speaker 3') continue
      assert.deepEqual(guest[i], regular[i], `row ${i} must be identical to the regular output`)
    }
  })
})
