/**
 * Agenda Server Actions
 *
 * Thin server-action wrappers over lib/agenda-logic.ts functions.
 * Called by the Agenda Wizard (components/agenda/wizard.tsx) from the client.
 */
'use server'

import { getAutoAssignments, cleanDraftText, MAJOR_ROLES, BACKUP_SPEAKER } from '@/lib/agenda-logic'
import { db } from '@/lib/db'
import { revalidatePath } from 'next/cache'
import { requireMember } from '@/lib/auth-guard'

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
 * Persists finalized role assignments to the database.
 * Uses a transactional delete-then-create pattern to avoid stale role conflicts.
 *
 * Two roles are protected from this write path:
 *   - Toastmaster is NEVER writable here. It is set by an admin, and the person
 *     running the wizard is usually the Toastmaster themselves.
 *   - The other major roles (and the Backup Speaker, which is admin-set even
 *     though it is not a major role) are only written when the caller explicitly
 *     unlocked them via the wizard's "Edit Major Roles" override.
 *
 * That second rule is not merely cosmetic. The wizard holds a snapshot of the
 * major roles taken when it loaded; blind-writing it would delete-then-recreate
 * those rows and silently revert any change an admin made in the meantime.
 *
 * @param meetingId   - Target meeting ID.
 * @param assignments - Map of roleName → user object (null = unassigned).
 * @param options     - `includeMajorRoles` opts major roles into the write.
 */
export async function saveFinalAgenda(
    meetingId: string,
    assignments: Record<string, { id: string } | null>,
    options?: { includeMajorRoles?: boolean }
) {
    await requireMember();

    const rolesToUpdate = Object.keys(assignments).filter(r => {
        if (r === 'Toastmaster') return false;
        if (MAJOR_ROLES.includes(r) || r === BACKUP_SPEAKER) return options?.includeMajorRoles === true;
        return true;
    });

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
                    userId: assignments[role]!.id,
                    roleName: role,
                    assignedAt: new Date()
                }))
        })
    ]);

    revalidatePath('/agenda');
    revalidatePath('/admin/calendar');
    return { success: true };
}
