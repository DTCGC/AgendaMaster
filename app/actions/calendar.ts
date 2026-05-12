/**
 * Calendar Server Actions
 *
 * Manages the meeting schedule from the admin Master Calendar panel.
 * Handles scheduling new meetings, toggling SCHEDULED ↔ CANCELLED, and deletion.
 * All meetings are pinned to Fridays at 6:45 PM, with July and August excluded.
 */
'use server'

import { db } from '@/lib/db'
import { revalidatePath } from 'next/cache'
import { MINOR_ROLES } from '@/lib/agenda-logic'

/**
 * Generates a list of upcoming Fridays for the calendar view.
 * Excludes July and August per club standing rules (summer break).
 * Caps at 20 Fridays (~5-6 months lookahead).
 */
export async function getFutureFridays() {
    const today = new Date();
    const fridays = [];
    
    // Generate Fridays for the next 12 months, filtering by spec rules
    for (let i = 0; i < 365; i++) {
        const d = new Date(today);
        d.setDate(today.getDate() + i);
        
        // 5 = Friday
        if (d.getDay() === 5) {
            const month = d.getMonth(); // 0-indexed
            // Spec: Globally disable Jul (6) and Aug (7)
            if (month !== 6 && month !== 7) {
                fridays.push(new Date(d));
            }
        }
        
        if (fridays.length >= 20) break; // Show roughly 6 months out
    }
    
    return fridays;
}

/**
 * Toggles a meeting date between SCHEDULED ↔ CANCELLED, or creates a new meeting.
 * When cancelling, clears the theme, Google Sheet link, and minor role assignments.
 * When creating, pins the time to 6:45 PM and links to the Regular template.
 *
 * @param dateIso    - ISO date string for the target Friday.
 * @param existingId - If provided, toggles the existing meeting's status.
 */
export async function toggleMeeting(dateIso: string, existingId?: string) {
    if (existingId) {
        const meeting = await db.meeting.findUnique({
            where: { id: existingId }
        });

        if (!meeting) return;

        if (meeting.status === 'ARCHIVED') return;
        const newStatus = meeting.status === 'SCHEDULED' ? 'CANCELLED' : 'SCHEDULED';
        
        await db.meeting.update({
            where: { id: existingId },
            data: { 
                status: newStatus as any,
                ...(newStatus === 'CANCELLED' ? { theme: null, googleSheetId: null, googleSheetUrl: null } : {})
            }
        });

        // Clear agenda data when cancelling (theme, sheet link, minor roles)
        if (newStatus === 'CANCELLED') {
            await db.roleAssignment.deleteMany({
                where: {
                    meetingId: existingId,
                    roleName: { in: MINOR_ROLES }
                }
            });
        }
    } else {
        // Schedule a new meeting: link to the Regular template, set 6:45 PM start
        let regularTemplate = await db.meetingTemplate.findFirst({
            where: { type: 'Regular' }
        });

        if (!regularTemplate) {
            regularTemplate = await db.meetingTemplate.create({
                data: { id: 'regular-template', type: 'Regular', schemaStructure: 'TIME,ROLE,,NAME,,\n' }
            });
        }

        const date = new Date(dateIso);
        date.setHours(18, 45, 0, 0);

        await db.meeting.create({
            data: {
                date: date,
                typeId: regularTemplate.id,
                status: 'SCHEDULED'
            }
        });
    }

    revalidatePath('/admin/calendar');
    revalidatePath('/agenda');
}

/**
 * Permanently deletes a meeting and all its role assignments.
 * Used for cleanup of erroneously created meetings.
 *
 * @param meetingId - The meeting to delete.
 */
export async function deleteMeeting(meetingId: string) {
    // Cascade: delete dependent role assignments before the meeting itself
    await db.roleAssignment.deleteMany({
        where: { meetingId }
    });

    await db.meeting.delete({
        where: { id: meetingId }
    });
    
    revalidatePath('/admin/calendar');
    revalidatePath('/agenda');
}
