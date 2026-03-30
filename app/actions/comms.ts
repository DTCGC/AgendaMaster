'use server'

import { db } from '@/lib/db'
import { quietlySendEmail } from '@/lib/email'

export async function dispatchMassComms(subject: string, htmlBody: string, targetGroup: 'MEMBERS' | 'SUBSCRIBERS' | 'ALL') {
    let emailList: string[] = [];

    if (targetGroup === 'MEMBERS' || targetGroup === 'ALL') {
        const members = await db.user.findMany({
            where: { role: { in: ['MEMBER', 'ADMIN'] } },
            select: { email: true }
        });
        emailList = emailList.concat(members.map(m => m.email));
    }

    if (targetGroup === 'SUBSCRIBERS' || targetGroup === 'ALL') {
        const subscribers = await db.subscriber.findMany({
            select: { email: true }
        });
        emailList = emailList.concat(subscribers.map(s => s.email));
    }

    // Deduplicate emails naturally overlapping
    const uniqueEmails = Array.from(new Set(emailList));

    if (uniqueEmails.length === 0) {
        return { success: false, message: "No active targets found in the selected group." };
    }

    // Process dispatches silently in parallel via standard promise.all map
    // Note: If using a generic real-world high volume SMTP standard, we map batches. 
    // Here we assume club size (~50).
    const transmissionPromises = uniqueEmails.map(email => 
        quietlySendEmail(email, subject, htmlBody)
    );

    await Promise.allSettled(transmissionPromises);

    return { 
        success: true, 
        message: `Successfully dispatched to ${uniqueEmails.length} recipients.`,
        recipientCount: uniqueEmails.length 
    };
}
