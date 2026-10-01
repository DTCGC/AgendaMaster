/**
 * Agenda Logic Module
 *
 * Contains the role definitions, heuristic auto-assignment algorithm,
 * and text-cleaning utilities used by the Agenda Wizard.
 *
 * The auto-assignment heuristic works by:
 * 1. Querying all MEMBER users with their most recent role assignment date.
 * 2. Sorting by recency (oldest first = highest priority).
 * 3. Restoring any minor roles already saved for the meeting.
 * 4. Distributing the remaining, still-empty MINOR_ROLES sequentially among
 *    members who hold no role for that meeting yet.
 *
 * Step 3 is what makes the wizard safe to reopen: saved rosters are preserved
 * rather than regenerated, so pressing "Update" never scrambles finalized roles.
 * Passing `ignoreSavedMinorRoles` skips it, which is the only way to force a
 * deliberate reshuffle — that is what the wizard's Regenerate button does.
 */

import { db } from './db';
import { getDisplayName } from './user-logic';
import type { UserWithDisplayName, AutoAssignmentResult } from './types';

// Role definitions live in lib/roles.ts (no database import, so client
// components can use them); re-exported here for existing server callers.
import { MINOR_ROLES, MAJOR_ROLES, BACKUP_SPEAKER } from './roles';
export { MINOR_ROLES, MAJOR_ROLES, BACKUP_SPEAKER };

/**
 * Runs the heuristic auto-assignment algorithm for a given meeting.
 *
 * @param meetingId - The meeting to generate assignments for.
 * @param options   - `ignoreSavedMinorRoles` discards the existing roster and
 *                    reshuffles from scratch (the wizard's Regenerate button).
 * @returns Object containing `assignments` (role→user map), `unassigned` (leftover members),
 *          `preAssignedMajor` (admin-set major roles with user data attached), and
 *          `backupSpeaker` (the standby, who is counted as roleless throughout).
 */
export async function getAutoAssignments(
  meetingId: string,
  options?: { ignoreSavedMinorRoles?: boolean }
): Promise<AutoAssignmentResult> {
  const ignoreSavedMinorRoles = options?.ignoreSavedMinorRoles === true;
  // Fetch all approved members (MEMBER role only; ADMINs are excluded from auto-assignment)
  const activeUsers = await db.user.findMany({
    where: {
      role: 'MEMBER'
    },
    include: {
      roleAssignments: {
        // Standby duty is not participation — see BACKUP_SPEAKER above.
        where: { roleName: { not: BACKUP_SPEAKER } },
        orderBy: {
          assignedAt: 'desc' // Most recent first
        },
        take: 1
      }
    }
  });

  // Build a sortable stats array: each member gets a recency timestamp and a display name
  const userStats = activeUsers.map((user) => {
    const lastAssignment = user.roleAssignments[0]?.assignedAt;
    const lastAssignedAt = lastAssignment ? new Date(lastAssignment).getTime() : 0;
    
    // Compute display name into a new object (avoids mutating Prisma result)
    const displayName = getDisplayName(user, activeUsers);
    
    return {
      user: { id: user.id, firstName: user.firstName, lastName: user.lastName, displayName },
      lastAssignedAt
    };
  });

  // Sort ascending: members who haven't had a role recently (or ever) get priority
  userStats.sort((a, b) => a.lastAssignedAt - b.lastAssignedAt);

  const existingAssignments = await db.roleAssignment.findMany({
    where: { meetingId }
  });

  // Lookup of member id → display-name-decorated user
  const usersById = new Map(userStats.map((stats) => [stats.user.id, stats.user]));

  // STEP 1 — Restore minor roles already saved for this meeting.
  // The heuristic is a *starting point*, not a source of truth: once the
  // Toastmaster has saved a roster, re-deriving it would silently reshuffle
  // (or drop) their work every time the wizard is reopened to make an update.
  const assignments: Record<string, UserWithDisplayName | null> = {};
  for (const role of MINOR_ROLES) {
    assignments[role] = null;
  }

  if (!ignoreSavedMinorRoles) {
    for (const a of existingAssignments) {
      if (!a.userId || !MINOR_ROLES.includes(a.roleName)) continue;
      const saved = usersById.get(a.userId);
      // Skip assignments pointing at users who are no longer active members —
      // leaving the slot empty lets the heuristic below fill it.
      if (saved) assignments[a.roleName] = saved;
    }
  }

  // Anyone already holding a role for this meeting — an admin-set major role or
  // a restored minor role — is out of the running for the remaining empty slots.
  // The backup speaker is the one exception: the whole point of the title is
  // that it leaves them free to take a minor role as well.
  //
  // When reshuffling, the saved minor roles are being thrown away — so their
  // holders must be released back into the pool here too. Skipping this would
  // exclude nearly the whole club from their own reshuffle and return a roster
  // of empty slots.
  const usersWithExistingRole = new Set(
    existingAssignments
      .filter((a) => a.userId && a.roleName !== BACKUP_SPEAKER)
      .filter((a) => !(ignoreSavedMinorRoles && MINOR_ROLES.includes(a.roleName)))
      .map((a) => a.userId)
  );

  const eligibleUsers = userStats
    .map((stats) => stats.user)
    .filter((u) => !usersWithExistingRole.has(u.id));

  // STEP 2 — Round-robin the *still-empty* minor roles to members who hold
  // nothing yet, in priority order (least-recently-assigned first).
  let userIndex = 0;
  for (const role of MINOR_ROLES) {
    if (assignments[role]) continue;
    if (userIndex < eligibleUsers.length) {
      assignments[role] = eligibleUsers[userIndex];
      userIndex++;
    }
  }

  const unassigned = eligibleUsers.slice(userIndex);

  // Resolved separately from `assignments` so no caller can mistake it for a
  // real role slot. Note the holder deliberately remains in `unassigned` too.
  const backupRow = existingAssignments.find((a) => a.roleName === BACKUP_SPEAKER && a.userId);
  const backupUser = backupRow ? activeUsers.find((u) => u.id === backupRow.userId) : undefined;

  return {
    assignments,
    unassigned,
    backupSpeaker: backupUser
      ? {
          id: backupUser.id,
          firstName: backupUser.firstName,
          lastName: backupUser.lastName,
          displayName: getDisplayName(backupUser, activeUsers)
        }
      : null,
    preAssignedMajor: existingAssignments.filter((a) => MAJOR_ROLES.includes(a.roleName)).map((a) => {
        // Find the user object from the activeUsers list we already fetched
        const u = activeUsers.find((user) => user.id === a.userId);
        const displayName = u ? getDisplayName(u, activeUsers) : '';
        return {
            ...a,
            user: u ? { id: u.id, firstName: u.firstName, lastName: u.lastName, displayName } : null
        };
    })
  };
}

/**
 * Sanitizes user-authored email draft text.
 * Currently fixes the common "DCGC" → "DTCGC" typo while preserving HTML tags.
 *
 * @param text - Raw HTML string from the Tiptap editor.
 * @returns Cleaned HTML string.
 */
export function cleanDraftText(text: string) {
  let cleaned = text;
  
  // Fix common DTCGC typo while preserving HTML tags if present
  cleaned = cleaned.replace(/\bDCGC\b/gi, 'DTCGC');
  
  return cleaned;
}
