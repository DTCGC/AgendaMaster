/**
 * Agenda Server Actions
 *
 * Thin server-action wrappers over lib/agenda-logic.ts functions.
 * Called by the Agenda Wizard (components/agenda/wizard.tsx) from the client.
 */
'use server'

import { getAutoAssignments, cleanDraftText } from '@/lib/agenda-logic'
import { db } from '@/lib/db'
import { revalidatePath } from 'next/cache'

/** Fetches auto-generated role assignments for a meeting via the heuristic engine. */
export async function fetchRoleAssignments(meetingId: string) {
    const data = await getAutoAssignments(meetingId);
    return data;
}

/** Sanitizes user-authored email draft text (typo correction, etc.). */
export async function formatDraft(text: string) {
    return cleanDraftText(text);
}

/**
 * Persists finalized role assignments to the database.
 * Uses a transactional delete-then-create pattern to avoid stale role conflicts.
 * Deliberately preserves the Toastmaster assignment (set separately by admins).
 *
 * @param meetingId   - Target meeting ID.
 * @param assignments - Map of roleName → user object (null = unassigned).
 */
export async function saveFinalAgenda(meetingId: string, assignments: Record<string, any>) {
    // Exclude Toastmaster — that role is locked and managed via the admin roles panel
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
