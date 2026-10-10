/**
 * Agenda sheet CHANGELOG — what an update writes under the header.
 *
 * The log is read back from the sheet and rewritten on every update (the
 * Toastmaster's, an admin's through the service account, and the 6:30 PM
 * refresh), so each of these failures was visible on a live sheet:
 *   - names in the "No Roles" grid were read as roles ("[Nathan: John ---> TBD]");
 *   - each write replaced the log with only its own diff, so a later save or the
 *     refresh erased earlier entries;
 *   - the template's "Example:" and numbered lines were left half-overwritten.
 */
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { populateTemplate, buildChangelog } from '@/lib/google-api'

const csvTemplate = readFileSync(
  join(process.cwd(), 'public', 'assets', 'templates', 'agenda-template.csv'),
  'utf8'
)

const NOW = new Date('2026-10-10T01:44:00Z') // Oct 9, 6:44 PM in Vancouver
const LATER = new Date('2026-10-10T01:50:00Z')

const ROSTER: Record<string, string> = {
  'Sergeant at Arms': 'Curtis', Toastmaster: 'Ethan', Timer: 'Millie', Grammarian: 'Franklin',
  'Speaker 1': 'Torres', 'Speaker #1': 'Torres', 'Speaker 3': 'Andrew',
  'Comments and Closing Remarks': 'Ethan',
}

/** A sheet as written by the app (and read back by the Values API). */
const sheet = (roleMap: Record<string, string>, unassigned: string[] = [], changelog: string[][] = [], guest = false) =>
  populateTemplate(csvTemplate, 'Theme', 'QOTD', roleMap, unassigned, changelog, guest)

/** One update: diff the current sheet against the new agenda, write both. */
function update(current: string[][], roleMap: Record<string, string>, now = NOW, unassigned: string[] = [], guest = false) {
  const agenda = sheet(roleMap, unassigned, [], guest)
  return sheet(roleMap, unassigned, buildChangelog(current, agenda, now), guest)
}

const logOf = (rows: string[][]) => {
  const header = rows.findIndex((r) => (r[1] || '').startsWith('CHANGELOG'))
  return rows.slice(header + 1).map((r) => r.slice(1).filter(Boolean).join(' | ')).filter(Boolean)
}

describe('entries', () => {
  test('a swap is one line naming the role, the old holder and the new one', () => {
    const rows = update(sheet(ROSTER), { ...ROSTER, Grammarian: 'Evangeline' })

    assert.deepEqual(logOf(rows), ['[Oct 9, 6:44 PM] Grammarian: Franklin ---> Evangeline'])
  })

  test('a role printed twice on the agenda is logged once', () => {
    const rows = update(sheet(ROSTER), { ...ROSTER, Timer: 'Jackson' })

    assert.deepEqual(logOf(rows), ['[Oct 9, 6:44 PM] Timer: Millie ---> Jackson'])
  })

  test('the Toastmaster is logged once, not again for Comments and Closing Remarks', () => {
    const rows = update(sheet(ROSTER), { ...ROSTER, Toastmaster: 'Brian', 'Comments and Closing Remarks': 'Brian' })

    assert.deepEqual(logOf(rows), ['[Oct 9, 6:44 PM] Toastmaster: Ethan ---> Brian'])
  })

  test('clearing and filling a role read as TBD, like the agenda itself', () => {
    const cleared = { ...ROSTER }
    delete cleared.Grammarian
    const rows = update(update(sheet(ROSTER), cleared), { ...cleared, Grammarian: 'Molly' }, LATER)

    assert.deepEqual(logOf(rows), [
      '[Oct 9, 6:44 PM] Grammarian: Franklin ---> TBD',
      '[Oct 9, 6:50 PM] Grammarian: TBD ---> Molly',
    ])
  })

  test('the No Roles attendance grid is never read as roles', () => {
    const before = sheet(ROSTER, ['John', 'Franklin', 'Nathan', 'Kris'])
    const rows = update(before, ROSTER, NOW, ['John', 'Kris', 'Nathan'])

    assert.deepEqual(logOf(rows), [])
  })

  test('a Guest Education relabel logs the Speaker 3 change once, and only once', () => {
    const guestMap = { ...ROSTER, 'Speaker 3': 'Dr. Jane Doe' }
    const first = update(sheet(ROSTER), guestMap, NOW, [], true)
    const second = update(first, guestMap, LATER, [], true)

    assert.deepEqual(logOf(second), ['[Oct 9, 6:44 PM] Guest Speaker: Andrew ---> Dr. Jane Doe'])
  })
})

describe('the log only grows', () => {
  test('a later update keeps the earlier entries', () => {
    const first = update(sheet(ROSTER), { ...ROSTER, Grammarian: 'Evangeline' })
    const second = update(first, { ...ROSTER, Grammarian: 'Evangeline', Timer: 'Jackson' }, LATER)

    assert.deepEqual(logOf(second), [
      '[Oct 9, 6:44 PM] Grammarian: Franklin ---> Evangeline',
      '[Oct 9, 6:50 PM] Timer: Millie ---> Jackson',
    ])
  })

  test('an update that changes nobody (the pre-meeting refresh) keeps the log as is', () => {
    const first = update(sheet(ROSTER), { ...ROSTER, Grammarian: 'Evangeline' })
    const refreshed = update(first, { ...ROSTER, Grammarian: 'Evangeline' }, LATER)

    assert.deepEqual(logOf(refreshed), logOf(first))
  })

  test('a line typed into the log by hand is kept', () => {
    const typed = sheet(ROSTER)
    typed.push(['', 'Molly left early'])
    const rows = update(typed, ROSTER)

    assert.deepEqual(logOf(rows), ['Molly left early'])
  })
})

describe('the template placeholders', () => {
  test('a new sheet has an empty log, without the example or numbered lines', () => {
    assert.deepEqual(logOf(sheet(ROSTER)), [])
  })

  test('a sheet still carrying them loses them on its first update', () => {
    const old = sheet(ROSTER)
    old.push(['', 'Example: [John: Filler Word Counter ---> Timer]'], ['', '1'], ['', '2'])
    const rows = update(old, { ...ROSTER, Grammarian: 'Evangeline' })

    assert.deepEqual(logOf(rows), ['[Oct 9, 6:44 PM] Grammarian: Franklin ---> Evangeline'])
  })
})
