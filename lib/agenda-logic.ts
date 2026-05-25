/**
 * Agenda Logic Module
 *
 * Contains the role definitions, heuristic auto-assignment algorithm,
 * and text-cleaning utilities used by the Agenda Wizard.
 *
 * The auto-assignment heuristic works by:
 * 1. Querying all MEMBER users with their most recent role assignment date.
 * 2. Sorting by recency (oldest first = highest priority).
 * 3. Distributing MINOR_ROLES sequentially, skipping members who already
 *    hold a MAJOR_ROLE for that meeting.
 */

import { db } from './db';
import { getDisplayName } from './user-logic';
import type { UserWithDisplayName, AutoAssignmentResult } from './types';

/** Roles automatically assigned by the heuristic engine (round-robin by recency). */
export const MINOR_ROLES = [
  "Sergeant at Arms",
  "Timer",
  "Grammarian",
  "Filler Word Counter",
  "Evaluator 1",
  "Evaluator 2",
  "Evaluator 3",
  "Table Topics Evaluator 1",
  "Table Topics Evaluator 2"
];

/** Roles manually assigned by admins via the Role Management panel. */
export const MAJOR_ROLES = [
  "Toastmaster",
  "Speaker 1",
  "Speaker 2",
  "Speaker 3",
  "Table Topics Master",
  "Quizmaster"
];

/** Roles permanently assigned to specific people per club standing rules. */
export const FIXED_ROLES = {
  "Business Meeting": "Andrew",
  "Roles for Next Meeting": "John"
};

/**
 * Runs the heuristic auto-assignment algorithm for a given meeting.
 *
 * @param meetingId - The meeting to generate assignments for.
 * @returns Object containing `assignments` (role→user map), `unassigned` (leftover members),
 *          and `preAssignedMajor` (admin-set major roles with user data attached).
 */
export async function getAutoAssignments(meetingId: string): Promise<AutoAssignmentResult> {
  // Fetch all approved members (MEMBER role only; ADMINs are excluded from auto-assignment)
  const activeUsers = await db.user.findMany({
    where: {
      role: 'MEMBER'
    },
    include: {
      roleAssignments: {
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

  // Exclude members who already have a manually-assigned Major Role for this meeting
  const existingAssignments = await db.roleAssignment.findMany({
    where: { meetingId }
  });

  const usersWithMajorRole = new Set(
    existingAssignments
      .filter((a) => MAJOR_ROLES.includes(a.roleName))
      .map((a) => a.userId)
  );

  const eligibleUsers = userStats
    .map((stats) => stats.user)
    .filter((u) => !usersWithMajorRole.has(u.id));

  // Round-robin distribute minor roles to eligible members (priority order)
  const assignments: Record<string, UserWithDisplayName | null> = {};
  
  let userIndex = 0;
  for (const role of MINOR_ROLES) {
    if (userIndex < eligibleUsers.length) {
      assignments[role] = eligibleUsers[userIndex];
      userIndex++;
    } else {
      assignments[role] = null;
    }
  }

  const unassigned = eligibleUsers.slice(userIndex);

  return {
    assignments,
    unassigned,
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
