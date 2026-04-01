'use server'

import { db } from '@/lib/db'
import { revalidatePath } from 'next/cache'
import { MINOR_ROLES } from '@/lib/agenda-logic'

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

export async function toggleMeeting(dateIso: string, existingId?: string) {
    if (existingId) {
        const meeting = await db.meeting.findUnique({
            where: { id: existingId }
        });

        if (!meeting) return;

        const newStatus = meeting.status === 'SCHEDULED' ? 'CANCELLED' : 'SCHEDULED';
        
        await db.meeting.update({
            where: { id: existingId },
            data: { 
                status: newStatus as any,
                ...(newStatus === 'CANCELLED' ? { theme: null, googleSheetId: null, googleSheetUrl: null } : {})
            }
        });

        // WIPE initialized agenda when toggled off/on for testing purpose
        if (newStatus === 'CANCELLED') {
            await db.roleAssignment.deleteMany({
                where: {
                    meetingId: existingId,
                    roleName: { in: MINOR_ROLES }
                }
            });
        }
    } else {
        // Create new
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

export async function deleteMeeting(meetingId: string) {
    // Delete any dependent role assignments first
    await db.roleAssignment.deleteMany({
        where: { meetingId }
    });

    await db.meeting.delete({
        where: { id: meetingId }
    });
    
    revalidatePath('/admin/calendar');
    revalidatePath('/agenda');
}
