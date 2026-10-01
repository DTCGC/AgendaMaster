/**
 * Role Persistence Module
 *
 * Owns every roster write: the admin Role Management panel and the agenda
 * wizard. Kept out of the server actions so it can be exercised without a
 * Next.js request context (see tests/roles-recency.test.ts).
 *
 * Each write is scoped to exactly the role names its caller owns. This is a
 * correctness boundary, not just tidiness: the delete-then-create below
 * re-stamps `assignedAt`, and `assignedAt` is what the auto-assignment
 * heuristic in lib/agenda-logic.ts sorts on. Letting a minor role through would
 * make its holder look freshly-served and silently demote them in the fairness
 * rotation without them having done anything.
 */

import { db } from './db'
import { MAJOR_ROLES, MINOR_ROLES, BACKUP_SPEAKER } from './roles'

/**
 * Every role the Role Management panel owns.
 *
 * BACKUP_SPEAKER is admin-assigned alongside the major roles but is deliberately
 * NOT one of them — it confers no duties, so lib/agenda-logic.ts keeps its holder
 * eligible for a minor role and excludes it from the recency sort. It has to be
 * listed explicitly here; a MAJOR_ROLES-only whitelist would silently discard
 * every standby assignment the panel submits.
 */
export const PANEL_ROLES: ReadonlySet<string> = new Set([...MAJOR_ROLES, BACKUP_SPEAKER])

/**
 * Roles the agenda wizard may write. The Toastmaster is never among them (an
 * admin sets it, and the wizard is usually run by the Toastmaster). The other
 * major roles join only when the caller unlocked "Edit Major Roles".
 */
export function wizardRoles(includeMajorRoles: boolean): ReadonlySet<string> {
  const roles = new Set<string>(MINOR_ROLES)
  if (includeMajorRoles) {
    for (const r of PANEL_ROLES) if (r !== 'Toastmaster') roles.add(r)
  }
  return roles
}

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

/** Thrown when a payload names someone who is not an approved member. */
export class UnknownMemberError extends Error {
  constructor() {
    super('One of the selected people is no longer an approved member. Reload the page and try again.')
    this.name = 'UnknownMemberError'
  }
}

/**
 * Replaces a meeting's assignments for the roles in `allowedRoles`.
 *
 * Uses a transactional delete-then-create so the swap is atomic. The delete is
 * scoped to the accepted role names only, leaving every other role (and its
 * `assignedAt` history) untouched.
 *
 * `assignedAt` is carried forward for any role whose holder is unchanged.
 * Callers post all of their roles on every save, so without this a single
 * swap would re-date every other role — a member assigned weeks ago would
 * look freshly served and sink in the fairness rotation. Only a genuine
 * change of holder counts as new participation.
 *
 * @param meetingId    - Target meeting ID.
 * @param assignments  - { roleName, userId } pairs; an empty userId clears the role.
 * @param allowedRoles - The roles this caller owns; anything else is dropped.
 * @returns The role names that were actually accepted and written.
 * @throws UnknownMemberError when a userId is not an approved account.
 */
export async function persistRoles(
  meetingId: string,
  assignments: { roleName: string; userId: string }[],
  allowedRoles: ReadonlySet<string>
) {
  const accepted = assignments.filter((a) => allowedRoles.has(a.roleName))
  if (accepted.length === 0) return []

  const roleNames = accepted.map((a) => a.roleName)
  const userIds = [...new Set(accepted.map((a) => a.userId).filter(Boolean))]
  const now = new Date()

  // Read and write inside one interactive transaction so the timestamps being
  // carried forward cannot be invalidated by a concurrent save.
  await db.$transaction(async (tx) => {
    const known = await tx.user.count({
      where: { id: { in: userIds }, role: { in: ['MEMBER', 'ADMIN'] } },
    })
    if (known !== userIds.length) throw new UnknownMemberError()

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

/** The Role Management panel's write: major roles plus the Backup Speaker. */
export function persistMajorRoles(
  meetingId: string,
  assignments: { roleName: string; userId: string }[]
) {
  return persistRoles(meetingId, assignments, PANEL_ROLES)
}
