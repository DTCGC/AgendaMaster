'use server'

import { db } from '@/lib/db'
import { quietlySendEmail, sendBccEmail } from '@/lib/email'

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

    // Send via a single structured BCC call to remain under restrictive provider rate limits
    const result = await sendBccEmail(uniqueEmails, subject, htmlBody);
    
    if (result.failed > 0) {
        return { 
            success: false, 
            message: "SMTP Transmission failed. Please verify credentials or rate limits on the live server." 
        };
    }

    return { 
        success: true, 
        message: `Successfully dispatched to ${result.succeeded} recipients.`,
        recipientCount: result.succeeded 
    };
}
