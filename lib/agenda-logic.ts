import { db } from './db';
import { getDisplayName } from './user-logic';

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

export const MAJOR_ROLES = [
  "Toastmaster",
  "Speaker 1",
  "Speaker 2",
  "Speaker 3",
  "Table Topics Master",
  "Quizmaster"
];

export const FIXED_ROLES = {
  "Business Meeting": "Andrew",
  "Roles for Next Meeting": "John"
};

export async function getAutoAssignments(meetingId: string) {
  // Query all non-pending members
  const activeUsers = await db.user.findMany({
    where: {
      role: { in: ['MEMBER', 'ADMIN'] }
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

  // Attach heuristic timestamp and compute privacy-compliant display names
  const userStats = activeUsers.map((user: any) => {
    const lastAssignment = user.roleAssignments[0]?.assignedAt;
    const lastAssignedAt = lastAssignment ? new Date(lastAssignment).getTime() : 0;
    
    // Add computed name for privacy
    user.displayName = getDisplayName(user, activeUsers);
    
    return {
      user,
      lastAssignedAt
    };
  });

  // Ascending order: Older timestamps (or 0) first
  userStats.sort((a: any, b: any) => a.lastAssignedAt - b.lastAssignedAt);

  // Pre-filter members who were manually assigned to Major Roles for this date
  const existingAssignments = await db.roleAssignment.findMany({
    where: { meetingId }
  });

  const usersWithMajorRole = new Set(
    existingAssignments
      .filter((a: any) => MAJOR_ROLES.includes(a.roleName))
      .map((a: any) => a.userId)
  );

  const eligibleUsers = userStats
    .map((stats: any) => stats.user)
    .filter((u: any) => !usersWithMajorRole.has(u.id));

  // Distribute Minor Roles to eligible members
  const assignments: Record<string, any> = {};
  
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
    preAssignedMajor: existingAssignments.filter((a: any) => MAJOR_ROLES.includes(a.roleName)).map((a: any) => {
        // Find the user object from the activeUsers list we already fetched
        const u = activeUsers.find((user: any) => user.id === a.userId);
        if (u) (u as any).displayName = getDisplayName(u, activeUsers);
        return {
            ...a,
            user: u ? { firstName: u.firstName, lastName: u.lastName, displayName: (u as any).displayName } : null
        };
    })
  };
}

export function cleanDraftText(text: string) {
  let cleaned = text;
  
  // Fix common DTCGC typo while preserving HTML tags if present
  cleaned = cleaned.replace(/\bDCGC\b/gi, 'DTCGC');
  
  return cleaned;
}
