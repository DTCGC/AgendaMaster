/**
 * Calendar Server Actions
 *
 * Manages the meeting schedule from the admin Master Calendar panel:
 * scheduling a meeting on an open Friday, and toggling SCHEDULED ↔ CANCELLED.
 * The schedule rules (Fridays at 6:45 PM, no July/August) live in
 * lib/meeting-schedule.ts.
 */
'use server'

import { db } from '@/lib/db'
import { MINOR_ROLES } from '@/lib/roles'
import { checkAdmin } from '@/lib/auth-guard'
import { isMeetingDay, meetingStartFor } from '@/lib/meeting-schedule'
import { revalidateMeetingViews } from '@/lib/revalidate'
import { carryBackupInto } from '@/lib/roles-logic'
import { fail, type ActionResult } from '@/lib/action-result'

/**
 * Toggles a meeting between SCHEDULED ↔ CANCELLED, or schedules a new one.
 *
 * Cancelling clears everything the Toastmaster prepared (theme, question,
 * meeting type, sheet link, minor roles) so a re-enabled meeting starts fresh;
 * admin-set major roles and the guest speaker name are kept. A scheduled or
 * re-enabled meeting inherits the previous meeting's Backup Speaker as a
 * speaker (lib/roles-logic.ts carryBackupInto).
 *
 * @param ymd        - The Friday, as "YYYY-MM-DD".
 * @param existingId - If provided, toggles that meeting's status.
 */
export async function toggleMeeting(ymd: string, existingId?: string): Promise<ActionResult> {
    const denied = await checkAdmin();
    if (denied) return denied;

    const start = meetingStartFor(ymd);
    if (!start || !isMeetingDay(start)) return fail('Meetings can only be scheduled on Fridays outside July and August.');
    if (start.getTime() <= Date.now()) return fail('That meeting has already started, so it can no longer be changed.');

    if (existingId) {
        const meeting = await db.meeting.findUnique({ where: { id: existingId } });
        if (!meeting) return fail('That meeting no longer exists. Reload the page.');
        if (meeting.status === 'ARCHIVED') return fail('Archived meetings cannot be changed.');

        const cancelling = meeting.status === 'SCHEDULED';
        await db.$transaction([
            db.meeting.update({
                where: { id: existingId },
                data: cancelling
                    ? {
                        status: 'CANCELLED',
                        theme: null,
                        qotd: null,
                        isGuestEducationSession: false,
                        googleSheetId: null,
                        googleSheetUrl: null,
                        agendaEmailPending: false,
                    }
                    : { status: 'SCHEDULED' },
            }),
            ...(cancelling
                ? [db.roleAssignment.deleteMany({ where: { meetingId: existingId, roleName: { in: MINOR_ROLES } } })]
                : []),
        ]);
        if (!cancelling) await carryBackupInto(existingId);
    } else {
        // One meeting per Friday: a double-submit must not create a second one.
        const dayStart = new Date(start.getFullYear(), start.getMonth(), start.getDate());
        const dayEnd = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 1);
        const clash = await db.meeting.findFirst({
            where: { date: { gte: dayStart, lt: dayEnd }, status: { not: 'ARCHIVED' } },
        });
        if (clash) {
            revalidateMeetingViews();
            return { success: true };
        }

        // The seed (prisma/seed.ts) guarantees this template on every deploy.
        const regularTemplate = await db.meetingTemplate.findFirst({ where: { type: 'Regular' } });
        if (!regularTemplate) return fail('The Regular agenda template is missing. Re-run the database seed.');

        const created = await db.meeting.create({
            data: { date: start, typeId: regularTemplate.id, status: 'SCHEDULED' },
        });
        // The previous meeting's Backup Speaker gets a speaking slot here.
        await carryBackupInto(created.id);
    }

    revalidateMeetingViews();
    return { success: true };
}
