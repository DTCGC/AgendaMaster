'use server'

import { db } from '@/lib/db'
import { revalidatePath } from 'next/cache'

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
