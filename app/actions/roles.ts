/**
 * Roles Server Actions
 *
 * Handles admin-initiated major role assignments (Toastmaster, Speakers, etc.).
 * Called from the admin Role Management panel (app/admin/roles/roles-form.tsx).
 */
'use server'

import { checkAdmin } from '@/lib/auth-guard'
import { persistMajorRoles, UnknownMemberError } from '@/lib/roles-logic'
import { revalidateMeetingViews } from '@/lib/revalidate'
import { fail, type ActionResult } from '@/lib/action-result'
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
export async function saveAllMajorRoles(
    meetingId: string,
    assignments: { roleName: string, userId: string }[]
): Promise<ActionResult> {
    const denied = await checkAdmin();
    if (denied) return denied;

    try {
        await persistMajorRoles(meetingId, assignments);
    } catch (error) {
        if (error instanceof UnknownMemberError) return fail(error.message);
        throw error;
    }

    revalidateMeetingViews();
    return { success: true };
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
export async function saveGuestSpeakerName(meetingId: string, name: string): Promise<ActionResult> {
    const denied = await checkAdmin();
    if (denied) return denied;

    await db.meeting.update({
        where: { id: meetingId },
        data: { guestSpeakerName: name.trim() || null }
    });

    revalidateMeetingViews();
    return { success: true };
}
