/**
 * Test Environment Bootstrap
 *
 * MUST be imported before anything that reaches `lib/db.ts`, which builds its
 * better-sqlite3 adapter from DATABASE_URL at import time. Importing this first
 * is what keeps tests off `dev.db`.
 *
 * Node's test runner gives each test FILE its own process, so this runs once
 * per file and the scratch databases never collide.
 */
import { execSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

const scratchDir = mkdtempSync(path.join(tmpdir(), 'agendamaster-test-'))

// Forward slashes: this string is handed to Prisma as a file: URL.
const dbFile = path.join(scratchDir, 'test.db').replace(/\\/g, '/')

process.env.DATABASE_URL = `file:${dbFile}`

// execSync takes one command string, so it works with Windows' npx.cmd (which
// spawnSync refuses to launch without a shell) and avoids the DEP0190 warning
// that execFileSync + `shell: true` would emit. The path is one we generated.
execSync(`npx prisma db push --url "file:${dbFile}"`, { stdio: 'ignore' })

process.on('exit', () => {
  try {
    rmSync(scratchDir, { recursive: true, force: true })
  } catch {
    // Best effort — the OS reclaims its own temp directory regardless.
  }
})
