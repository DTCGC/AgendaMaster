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
import { db } from '@/lib/db'

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

/**
 * Saves the meeting's guest speaker name (a free-text field, not a member).
 *
 * Deliberately NOT routed through persistMajorRoles: a guest is not a User
 * row, so it lives on the Meeting itself (like theme/qotd). The value is
 * inert until the Toastmaster marks the meeting a Guest Education Session —
 * only then does buildRoleMap() surface it over Speaker 3 — so the admin can
 * set it at any point during planning without side effects.
 */
export async function saveGuestSpeakerName(meetingId: string, name: string) {
    await requireAdmin();

    await db.meeting.update({
        where: { id: meetingId },
        data: { guestSpeakerName: name.trim() || null }
    });

    revalidatePath('/admin/roles');
    revalidatePath('/agenda');
}
