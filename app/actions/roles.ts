/**
 * Roles Server Actions
 *
 * Handles admin-initiated major role assignments (Toastmaster, Speakers, etc.).
 * Called from the admin Role Management panel (app/admin/roles/roles-form.tsx).
 */
'use server'

import { db } from '@/lib/db'
import { revalidatePath } from 'next/cache'

/**
 * Saves all major role assignments for a meeting.
 * Uses a transactional delete-then-create to atomically replace stale assignments.
 *
 * @param meetingId   - Target meeting ID.
 * @param assignments - Array of { roleName, userId } pairs.
 */
export async function saveAllMajorRoles(meetingId: string, assignments: { roleName: string, userId: string }[]) {
    const roleNames = assignments.map(a => a.roleName);
    
    await db.$transaction([
        db.roleAssignment.deleteMany({
            where: { meetingId, roleName: { in: roleNames } }
        }),
        db.roleAssignment.createMany({
            data: assignments.filter(a => !!a.userId).map(a => ({
                meetingId,
                roleName: a.roleName,
                userId: a.userId
            }))
        })
    ]);

    revalidatePath('/admin/roles');
    revalidatePath('/agenda');
}
