'use server'

import { getAutoAssignments, cleanDraftText, MINOR_ROLES } from '@/lib/agenda-logic'
import { db } from '@/lib/db'
import { revalidatePath } from 'next/cache'

export async function fetchRoleAssignments(meetingId: string) {
    const data = await getAutoAssignments(meetingId);
    return data;
}

export async function formatDraft(text: string) {
    return cleanDraftText(text);
}

export async function saveFinalAgenda(meetingId: string, assignments: Record<string, any>) {
    // 1. Transactional Delete/Create for Minor Roles
    // (Major roles are already handled separately in the Admin Panel)
    const minorRoles = Object.keys(assignments).filter(r => MINOR_ROLES.includes(r));
    
    await db.$transaction([
        db.roleAssignment.deleteMany({
            where: {
                meetingId,
                roleName: { in: MINOR_ROLES }
            }
        }),
        db.roleAssignment.createMany({
            data: minorRoles
                .filter(role => assignments[role] !== null)
                .map(role => ({
                    meetingId,
                    userId: assignments[role].id,
                    roleName: role,
                    assignedAt: new Date()
                }))
        })
    ]);

    revalidatePath('/agenda');
    revalidatePath('/admin/calendar');
    return { success: true };
}
