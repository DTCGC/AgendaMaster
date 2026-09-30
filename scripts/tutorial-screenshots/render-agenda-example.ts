/**
 * Renders the demo meeting's agenda as a spreadsheet-looking HTML page.
 *
 * Uses the app's own sheet builders (buildSheetPayload + populateTemplate), so
 * the example in the tutorial has exactly the rows a real agenda sheet gets —
 * only the grid styling is imitated. Writes `.out/agenda-example.html`, which
 * capture.mjs screenshots. Run after `demo-seed.ts --finalize`.
 *
 * Usage (from the repo root):
 *   npx tsx scripts/tutorial-screenshots/render-agenda-example.ts
 */

import * as fs from 'fs'
import * as path from 'path'

const OUT_DIR = path.join(__dirname, '.out')
const DB_PATH = path.join(OUT_DIR, 'demo.db')

// Must be set before lib/db.ts is loaded, hence the dynamic imports below.
process.env.DATABASE_URL = `file:${DB_PATH}`

const escape = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

async function main() {
  const { db } = await import('../../lib/db')
  const { buildSheetPayload } = await import('../../lib/agenda-sheet')
  const { populateTemplate } = await import('../../lib/google-api')

  const meeting = await db.meeting.findFirst({ where: { status: 'SCHEDULED' }, orderBy: { date: 'asc' } })
  if (!meeting?.googleSheetId) {
    throw new Error('Run demo-seed.ts --finalize first: the demo meeting has no agenda yet.')
  }

  const payload = await buildSheetPayload(meeting.id, '', '', '')
  if (!payload) throw new Error('Could not build the demo agenda.')
  const rows = populateTemplate(
    payload.csvTemplate, payload.effectiveTheme, payload.effectiveQotd,
    payload.roleMap, payload.unassignedNames, [], payload.guestEducationActive
  )

  const month = String(meeting.date.getMonth() + 1).padStart(2, '0')
  const day = String(meeting.date.getDate()).padStart(2, '0')
  const title = `Gavel Club ${month}/${day} - ${payload.effectiveTheme}`
  const cols = ['A', 'B', 'C', 'D', 'E', 'F']

  const body = rows.map((row, i) => `
      <tr><th class="rn">${i + 1}</th>${cols.map((_, c) => `<td>${escape(row[c] ?? '')}</td>`).join('')}</tr>`).join('')

  const html = `<!doctype html>
<html><head><meta charset="utf-8"><title>${escape(title)}</title>
<style>
  body { margin: 0; font-family: Arial, Helvetica, sans-serif; background: #f9fbfd; }
  #sheet { width: 820px; background: #fff; border: 1px solid #dadce0; }
  .bar { display: flex; align-items: center; gap: 12px; padding: 12px 16px; border-bottom: 1px solid #dadce0; }
  .logo { width: 24px; height: 32px; background: #188038; border-radius: 3px; position: relative; }
  .logo::after { content: ''; position: absolute; inset: 11px 5px 7px; border: 2px solid #fff; border-radius: 1px; }
  .name { font-size: 18px; color: #1f1f1f; }
  .menu { font-size: 13px; color: #444; margin-top: 2px; }
  table { border-collapse: collapse; font-size: 13px; width: 100%; table-layout: fixed; }
  th { background: #f8f9fa; color: #5f6368; font-weight: normal; border: 1px solid #e1e3e6; height: 20px; font-size: 11px; }
  th.rn { width: 38px; }
  td { border: 1px solid #e1e3e6; padding: 2px 5px; height: 19px; white-space: nowrap; overflow: visible; color: #1f1f1f; }
  col.b { width: 210px; }
</style></head>
<body><div id="sheet">
  <div class="bar"><div class="logo"></div><div><div class="name">${escape(title)}</div>
  <div class="menu">File&nbsp;&nbsp; Edit&nbsp;&nbsp; View&nbsp;&nbsp; Insert&nbsp;&nbsp; Format&nbsp;&nbsp; Data&nbsp;&nbsp; Tools&nbsp;&nbsp; Help</div></div></div>
  <table>
    <colgroup><col style="width:38px"><col style="width:90px"><col class="b"><col style="width:40px"><col style="width:150px"><col><col></colgroup>
    <tr><th class="rn"></th>${cols.map((c) => `<th>${c}</th>`).join('')}</tr>${body}
  </table>
</div></body></html>`

  fs.writeFileSync(path.join(OUT_DIR, 'agenda-example.html'), html)
  console.log('✓ Wrote .out/agenda-example.html')
  await db.$disconnect()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
