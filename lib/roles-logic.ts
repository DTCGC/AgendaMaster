/**
 * Major Role Persistence Module
 *
 * Owns the write path behind the admin Role Management panel. Kept out of the
 * server action itself so it can be exercised without a Next.js request context
 * (see test_roles_recency.ts).
 *
 * The write is scoped to exactly the role names the panel renders. This is a
 * correctness boundary, not just tidiness: the delete-then-create below
 * re-stamps `assignedAt`, and `assignedAt` is what the auto-assignment
 * heuristic in lib/agenda-logic.ts sorts on. Letting a minor role through would
 * make its holder look freshly-served and silently demote them in the fairness
 * rotation without them having done anything.
 */

import { db } from './db'
import { MAJOR_ROLES, BACKUP_SPEAKER } from './agenda-logic'

/**
 * Every role the Role Management panel owns.
 *
 * BACKUP_SPEAKER is admin-assigned alongside the major roles but is deliberately
 * NOT one of them — it confers no duties, so lib/agenda-logic.ts keeps its holder
 * eligible for a minor role and excludes it from the recency sort. It has to be
 * listed explicitly here; a MAJOR_ROLES-only whitelist would silently discard
 * every standby assignment the panel submits.
 */
const PANEL_ROLES = new Set<string>([...MAJOR_ROLES, BACKUP_SPEAKER])

/**
 * Drops any assignment whose role is not one the Role Management panel owns.
 *
 * Server actions are publicly callable POST endpoints, so the payload cannot be
 * trusted to match what the form rendered — an authenticated admin (or a stale
 * client bundle) can post arbitrary role names.
 *
 * @param assignments - Raw { roleName, userId } pairs from the client.
 * @returns Only the pairs naming a role the panel is allowed to write.
 */
export function filterToPanelRoles<T extends { roleName: string }>(assignments: T[]): T[] {
  return assignments.filter((a) => PANEL_ROLES.has(a.roleName))
}

/**
 * Replaces the major-role assignments for a meeting.
 *
 * Uses a transactional delete-then-create so the swap is atomic. The delete is
 * scoped to the whitelisted role names only, leaving minor roles (and their
 * `assignedAt` history) untouched.
 *
 * `assignedAt` is carried forward for any role whose holder is unchanged. The
 * panel posts all of its roles on every save, so without this a single speaker
 * swap would re-date every other major role — a Toastmaster assigned weeks ago
 * would look freshly served and sink in the fairness rotation. Only a genuine
 * change of holder counts as new participation.
 *
 * @param meetingId   - Target meeting ID.
 * @param assignments - Array of { roleName, userId } pairs; empty userId clears the role.
 * @returns The role names that were actually accepted and written.
 */
export async function persistMajorRoles(
  meetingId: string,
  assignments: { roleName: string; userId: string }[]
) {
  const accepted = filterToPanelRoles(assignments)
  if (accepted.length === 0) return []

  const roleNames = accepted.map((a) => a.roleName)
  const now = new Date()

  // Read and write inside one interactive transaction so the timestamps being
  // carried forward cannot be invalidated by a concurrent save.
  await db.$transaction(async (tx) => {
    const previous = await tx.roleAssignment.findMany({
      where: { meetingId, roleName: { in: roleNames } },
    })
    const previousByRole = new Map(previous.map((row) => [row.roleName, row]))

    await tx.roleAssignment.deleteMany({
      where: { meetingId, roleName: { in: roleNames } },
    })

    await tx.roleAssignment.createMany({
      data: accepted
        .filter((a) => !!a.userId)
        .map((a) => {
          const prior = previousByRole.get(a.roleName)
          const sameHolder = prior?.userId === a.userId
          return {
            meetingId,
            roleName: a.roleName,
            userId: a.userId,
            assignedAt: sameHolder && prior ? prior.assignedAt : now,
          }
        }),
    })
  })

  return roleNames
}
