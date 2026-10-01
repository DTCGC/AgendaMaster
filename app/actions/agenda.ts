/**
 * Agenda Server Actions
 *
 * Thin server-action wrappers over lib/agenda-logic.ts functions.
 * Called by the Agenda Wizard (components/agenda/wizard.tsx) from the client.
 */
'use server'

import { getAutoAssignments, cleanDraftText } from '@/lib/agenda-logic'
import { db } from '@/lib/db'
import { requireMember } from '@/lib/auth-guard'
import { auth } from '@/auth'
import { meetingEditDenial } from '@/lib/meeting-access'
import { persistRoles, wizardRoles, UnknownMemberError } from '@/lib/roles-logic'
import { revalidateMeetingViews } from '@/lib/revalidate'
import { fail, type ActionResult } from '@/lib/action-result'

/**
 * Fetches auto-generated role assignments for a meeting via the heuristic engine.
 * Guarded: the response is a full club roster, which is not public information.
 */
export async function fetchRoleAssignments(meetingId: string) {
    await requireMember();
    const data = await getAutoAssignments(meetingId);
    return data;
}

/**
 * Returns the meeting's saved theme and Question of the Day.
 *
 * The wizard needs these to rehydrate Step 2 on every load. Without it, an
 * update-mode entry (`?step=3`, which never renders Step 2) or a plain page
 * refresh would hold empty strings and then push those empties through the
 * execution pipeline, blanking the values already written to the sheet.
 *
 * Deliberately separate from fetchRoleAssignments: that call is the roster
 * heuristic, and meeting metadata has no business travelling through it.
 */
export async function fetchMeetingSettings(meetingId: string) {
    await requireMember();
    const meeting = await db.meeting.findUnique({
        where: { id: meetingId },
        select: { theme: true, qotd: true, isGuestEducationSession: true, guestSpeakerName: true }
    });
    return {
        theme: meeting?.theme ?? '',
        qotd: meeting?.qotd ?? '',
        isGuestEducationSession: meeting?.isGuestEducationSession ?? false,
        guestSpeakerName: meeting?.guestSpeakerName ?? ''
    };
}

/**
 * Reshuffles the minor roles from scratch, discarding the saved roster.
 *
 * Normal loads deliberately preserve whatever the Toastmaster last saved, so
 * this is the only path that re-runs the heuristic. Major roles, the locked
 * Toastmaster and the Backup Speaker are untouched — only minor roles move.
 *
 * Returns the fresh roster WITHOUT writing it. Nothing is persisted until the
 * Toastmaster saves, so a reshuffle they dislike can be abandoned by leaving.
 */
export async function regenerateRoster(meetingId: string) {
    await requireMember();
    return getAutoAssignments(meetingId, { ignoreSavedMinorRoles: true });
}

/** Sanitizes user-authored email draft text (typo correction, etc.). */
export async function formatDraft(text: string) {
    return cleanDraftText(text);
}

/**
 * Persists the wizard's role assignments.
 *
 * Only the meeting's Toastmaster or an admin may call this (lib/meeting-access.ts),
 * and only for the roles the wizard owns (lib/roles-logic.ts `wizardRoles`):
 *   - Toastmaster is NEVER writable here. It is set by an admin, and the person
 *     running the wizard is usually the Toastmaster themselves.
 *   - The other major roles (and the Backup Speaker) are only written when the
 *     caller explicitly unlocked them via the wizard's "Edit Major Roles" override.
 *
 * That second rule is not merely cosmetic. The wizard holds a snapshot of the
 * major roles taken when it loaded; blind-writing it would delete-then-recreate
 * those rows and silently revert any change an admin made in the meantime.
 *
 * Holders who did not change keep their `assignedAt`, so re-saving a roster
 * never pushes its members back in the fairness rotation.
 *
 * @param meetingId   - Target meeting ID.
 * @param assignments - Map of roleName → user object (null = unassigned).
 * @param options     - `includeMajorRoles` opts major roles into the write.
 */
export async function saveFinalAgenda(
    meetingId: string,
    assignments: Record<string, { id: string } | null>,
    options?: { includeMajorRoles?: boolean }
): Promise<ActionResult> {
    const session = await auth();
    const denial = await meetingEditDenial(session?.user, meetingId);
    if (denial) return fail(denial);

    try {
        await persistRoles(
            meetingId,
            Object.entries(assignments).map(([roleName, user]) => ({ roleName, userId: user?.id ?? '' })),
            wizardRoles(options?.includeMajorRoles === true)
        );
    } catch (error) {
        if (error instanceof UnknownMemberError) return fail(error.message);
        throw error;
    }

    revalidateMeetingViews();
    return { success: true };
}
