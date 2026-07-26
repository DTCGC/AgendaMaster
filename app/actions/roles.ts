/**
 * Roles Server Actions
 *
 * Handles admin-initiated major role assignments (Toastmaster, Speakers, etc.).
 * Called from the admin Role Management panel (app/admin/roles/roles-form.tsx).
 */
'use server'

import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/lib/auth-guard'
import { persistMajorRoles } from '@/lib/roles-logic'

/**
 * Saves all major role assignments for a meeting.
 *
 * Role names outside MAJOR_ROLES are discarded server-side — the write
 * re-stamps `assignedAt`, so accepting a minor role here would corrupt the
 * participation-recency data the auto-assignment heuristic depends on.
 *
 * @param meetingId   - Target meeting ID.
 * @param assignments - Array of { roleName, userId } pairs.
 */
export async function saveAllMajorRoles(meetingId: string, assignments: { roleName: string, userId: string }[]) {
    await requireAdmin();

    await persistMajorRoles(meetingId, assignments);

    revalidatePath('/admin/roles');
    revalidatePath('/agenda');
}
