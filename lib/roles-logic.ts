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
  const assignedAt = new Date()

  await db.$transaction([
    db.roleAssignment.deleteMany({
      where: { meetingId, roleName: { in: roleNames } },
    }),
    db.roleAssignment.createMany({
      data: accepted
        .filter((a) => !!a.userId)
        .map((a) => ({
          meetingId,
          roleName: a.roleName,
          userId: a.userId,
          assignedAt,
        })),
    }),
  ])

  return roleNames
}
