/**
 * Test Database Helpers
 *
 * Seeding shortcuts over a throwaway SQLite database, so tests exercise the
 * real Prisma-backed logic without touching `dev.db`.
 *
 * The `./env.ts` import below is load-bearing and must stay first: it points
 * DATABASE_URL at a scratch file before `@/lib/db` is evaluated. Module
 * evaluation follows import order in both CJS and ESM, so this holds either way.
 */
import './env'

import { db } from '@/lib/db'

export { db }

/** Wipes every table. Call in beforeEach so tests cannot leak into each other. */
export async function resetDb() {
  await db.roleAssignment.deleteMany()
  await db.meeting.deleteMany()
  await db.meetingTemplate.deleteMany()
  await db.user.deleteMany()
  await db.subscriber.deleteMany()
}

/** Creates a meeting (with its required template) and returns it. */
export async function createMeeting(date = new Date('2026-09-04')) {
  const template = await db.meetingTemplate.create({
    data: { type: 'Regular', schemaStructure: 'placeholder' }
  })
  return db.meeting.create({ data: { date, typeId: template.id } })
}

/**
 * Creates approved members from a list of first names.
 * Returns a lookup so tests read as `members.Alice` rather than by index.
 */
export async function createMembers(firstNames: string[]) {
  const byName: Record<string, { id: string; firstName: string }> = {}
  for (const firstName of firstNames) {
    byName[firstName] = await db.user.create({
      data: {
        firstName,
        lastName: 'Test',
        email: `${firstName.toLowerCase()}@example.com`,
        role: 'MEMBER'
      }
    })
  }
  return byName
}

/** Assigns a role, optionally backdated to simulate participation history. */
export async function assignRole(
  meetingId: string,
  roleName: string,
  userId: string,
  assignedAt = new Date()
) {
  return db.roleAssignment.create({
    data: { meetingId, roleName, userId, assignedAt }
  })
}
