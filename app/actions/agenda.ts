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
    // 1. Transactional Delete/Create for Minor and Editable Major Roles
    // (Toastmaster role is separate)
    const rolesToUpdate = Object.keys(assignments).filter(r => r !== 'Toastmaster');
    
    await db.$transaction([
        db.roleAssignment.deleteMany({
            where: {
                meetingId,
                roleName: { in: rolesToUpdate }
            }
        }),
        db.roleAssignment.createMany({
            data: rolesToUpdate
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
