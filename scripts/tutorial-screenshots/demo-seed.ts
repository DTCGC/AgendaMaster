/**
 * Tutorial Screenshot Demo Database
 *
 * Builds a throwaway SQLite database full of made-up members, so the tutorial
 * screenshots never show a real club member. Everything lands in the
 * gitignored `.out/` folder next to this file — the real dev.db and the
 * production database are never touched.
 *
 * Usage (from the repo root):
 *   npx tsx scripts/tutorial-screenshots/demo-seed.ts             # fresh DB, agenda not yet prepared
 *   npx tsx scripts/tutorial-screenshots/demo-seed.ts --finalize  # existing DB: the Toastmaster has now sent the agenda
 *
 * A fresh run recreates the database (stop the demo dev server first — Windows
 * won't delete an open file) and generates new random passwords, written only
 * to `.out/demo-credentials.json` (read by capture.mjs). `--finalize` edits the
 * existing database in place, so it is safe while the dev server is running.
 */

import { execSync } from 'child_process'
import { randomBytes } from 'crypto'
import * as fs from 'fs'
import * as path from 'path'
import bcrypt from 'bcryptjs'
import { PrismaClient } from '@prisma/client'
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3'

// Mirrors lib/agenda-logic.ts. Copied rather than imported: that module pulls in
// lib/db.ts, which opens whatever DATABASE_URL points at (dev.db by default).
const MINOR_ROLES = [
  'Sergeant at Arms', 'Timer', 'Grammarian', 'Filler Word Counter',
  'Evaluator 1', 'Evaluator 2', 'Evaluator 3',
  'Table Topics Evaluator 1', 'Table Topics Evaluator 2',
]
const BACKUP_SPEAKER = 'Backup Speaker'

const OUT_DIR = path.join(__dirname, '.out')
const DB_PATH = path.join(OUT_DIR, 'demo.db')
const REPO_ROOT = path.join(__dirname, '..', '..')
const finalizeOnly = process.argv.includes('--finalize')

// Made-up people. None of these are club members.
const TOASTMASTER = { firstName: 'Olivia', lastName: 'Park', email: 'olivia.park@example.com' }
const MEMBER = { firstName: 'Noah', lastName: 'Singh', email: 'noah.singh@example.com' }
const OTHERS = [
  ['Hannah', 'Tremblay'], ['Lucas', 'Nguyen'], ['Ava', 'Martin'], ['Leo', 'Fischer'],
  ['Chloe', 'Dubois'], ['Owen', 'Kaur'], ['Mia', 'Rossi'], ['Liam', 'Harper'],
  ['Zoe', 'Kim'], ['Ryan', 'Patel'], ['Sofia', 'Lopez'], ['Daniel', 'Ito'],
  ['Grace', 'Obi'], ['Henry', 'Walsh'], ['Isla', 'Moreau'], ['Felix', 'Hayes'],
  ['Nora', 'Ali'], ['Sam', 'Ortiz'],
]

// Major roles for the upcoming meeting (the executive team's picks).
const MAJOR_PICKS: Record<string, string> = {
  'Speaker 1': 'Lucas',
  'Speaker 2': 'Ava',
  'Speaker 3': 'Leo',
  'Table Topics Master': 'Chloe',
  'Quizmaster': 'Owen',
}
const BACKUP_PICK = 'Mia'

/** The next Friday at 6:45 PM local time (today counts if it's still before the meeting). */
function nextMeetingDate(): Date {
  const d = new Date()
  d.setHours(18, 45, 0, 0)
  const daysUntilFriday = (5 - d.getDay() + 7) % 7
  d.setDate(d.getDate() + daysUntilFriday)
  if (d.getTime() < Date.now()) d.setDate(d.getDate() + 7)
  return d
}

function openDb() {
  return new PrismaClient({ adapter: new PrismaBetterSqlite3({ url: DB_PATH }) })
}

/** Recreates the database: members, past meetings, and next Friday's meeting with its major roles. */
async function createFresh() {
  fs.mkdirSync(OUT_DIR, { recursive: true })
  for (const suffix of ['', '-journal', '-wal', '-shm']) {
    fs.rmSync(DB_PATH + suffix, { force: true })
  }

  execSync('npx prisma db push', {
    cwd: REPO_ROOT,
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: `file:${DB_PATH.replace(/\\/g, '/')}` },
  })

  const db = openDb()
  try {
    const csv = fs.readFileSync(path.join(REPO_ROOT, 'public', 'assets', 'templates', 'agenda-template.csv'), 'utf-8')
    const template = await db.meetingTemplate.create({ data: { type: 'Regular', schemaStructure: csv } })

    const credentials: Record<string, { email: string; password: string }> = {}
    const withPassword = async (key: string, data: { firstName: string; lastName: string; email: string; role: string }) => {
      const password = randomBytes(12).toString('base64url')
      credentials[key] = { email: data.email, password }
      return db.user.create({ data: { ...data, passwordHash: await bcrypt.hash(password, 10) } })
    }

    const toastmaster = await withPassword('toastmaster', { ...TOASTMASTER, role: 'MEMBER' })
    const member = await withPassword('member', { ...MEMBER, role: 'MEMBER' })
    // Accounts still on their way in, for the sign-up screenshots.
    await withPassword('incomplete', { firstName: '', lastName: '', email: 'new.member@example.com', role: 'INCOMPLETE' })
    await withPassword('pending', { firstName: 'Ella', lastName: 'Brooks', email: 'ella.brooks@example.com', role: 'PENDING' })

    const others = []
    for (const [firstName, lastName] of OTHERS) {
      others.push(await db.user.create({
        data: { firstName, lastName, email: `${firstName}.${lastName}@example.com`.toLowerCase(), role: 'MEMBER' }
      }))
    }
    const everyone = [toastmaster, member, ...others]
    const byFirstName = (name: string) => everyone.find((u) => u.firstName === name)!

    // A few past meetings, so "who had a role recently" has something to go on.
    const upcoming = nextMeetingDate()
    for (let weeksAgo = 4; weeksAgo >= 1; weeksAgo--) {
      const date = new Date(upcoming)
      date.setDate(date.getDate() - 7 * weeksAgo)
      const past = await db.meeting.create({
        data: { date, typeId: template.id, status: 'ARCHIVED', theme: 'Past meeting' }
      })
      const pool = everyone.slice((weeksAgo * 4) % everyone.length).concat(everyone)
      for (const [i, roleName] of MINOR_ROLES.slice(0, 4).entries()) {
        await db.roleAssignment.create({
          data: { meetingId: past.id, userId: pool[i].id, roleName, assignedAt: date }
        })
      }
    }

    const meeting = await db.meeting.create({
      data: { date: upcoming, typeId: template.id, status: 'SCHEDULED' },
    })
    await db.roleAssignment.create({ data: { meetingId: meeting.id, userId: toastmaster.id, roleName: 'Toastmaster' } })
    for (const [roleName, firstName] of Object.entries(MAJOR_PICKS)) {
      await db.roleAssignment.create({ data: { meetingId: meeting.id, userId: byFirstName(firstName).id, roleName } })
    }
    await db.roleAssignment.create({ data: { meetingId: meeting.id, userId: byFirstName(BACKUP_PICK).id, roleName: BACKUP_SPEAKER } })

    fs.writeFileSync(path.join(OUT_DIR, 'demo-credentials.json'), JSON.stringify(credentials, null, 2))
    console.log(`✓ Demo database ready at ${DB_PATH} (agenda not yet prepared).`)
    console.log(`  Meeting: ${upcoming.toString()}`)
    console.log('  Credentials written to .out/demo-credentials.json')
  } finally {
    await db.$disconnect()
  }
}

/**
 * Pretends the Toastmaster has finished the wizard: theme, QOTD, a placeholder
 * sheet link and a full set of minor roles. Edits the existing database in place.
 */
async function finalize() {
  if (!fs.existsSync(DB_PATH)) throw new Error('No demo database yet: run this script without --finalize first.')
  const db = openDb()
  try {
    const meeting = await db.meeting.findFirst({
      where: { status: 'SCHEDULED' },
      include: { roleAssignments: true },
      orderBy: { date: 'asc' },
    })
    if (!meeting) throw new Error('The demo database has no scheduled meeting.')

    const taken = new Set(
      meeting.roleAssignments.filter((a) => a.roleName !== BACKUP_SPEAKER).map((a) => a.userId)
    )
    const members = await db.user.findMany({ where: { role: 'MEMBER' }, orderBy: { createdAt: 'asc' } })
    const free = members.filter((u) => !taken.has(u.id))

    await db.roleAssignment.deleteMany({ where: { meetingId: meeting.id, roleName: { in: MINOR_ROLES } } })
    for (const [i, roleName] of MINOR_ROLES.entries()) {
      await db.roleAssignment.create({ data: { meetingId: meeting.id, userId: free[i].id, roleName } })
    }
    await db.meeting.update({
      where: { id: meeting.id },
      data: {
        theme: 'Space Exploration',
        qotd: 'If you could visit any planet, which one would you choose and why?',
        googleSheetId: 'demo-sheet',
        googleSheetUrl: 'https://docs.google.com/spreadsheets/d/demo-sheet/edit',
      },
    })
    console.log('✓ Demo meeting finalized (minor roles, theme, QOTD and a placeholder sheet link).')
  } finally {
    await db.$disconnect()
  }
}

;(finalizeOnly ? finalize() : createFresh()).catch((e) => {
  console.error(e)
  process.exit(1)
})
