/**
 * Communications Server Actions
 *
 * Handles mass email dispatch from the admin Broadcast panel.
 * Segments recipients into MEMBERS (active users), SUBSCRIBERS (guest waitlist),
 * or ALL (both). Uses BCC delivery via lib/email.ts.
 */
'use server'

import { db } from '@/lib/db'
import { sendBccEmail } from '@/lib/email'
import { checkAdmin } from '@/lib/auth-guard'
import { fail, type ActionResult } from '@/lib/action-result'

/**
 * Dispatches a mass email to the selected target group. Admin only: this
 * sends arbitrary HTML from the club's address to everyone on file.
 *
 * @param subject     - Email subject line.
 * @param htmlBody    - Rich HTML email body (from the Tiptap editor).
 * @param targetGroup - Recipient segment: 'MEMBERS', 'SUBSCRIBERS', or 'ALL'.
 */
export async function dispatchMassComms(
    subject: string,
    htmlBody: string,
    targetGroup: 'MEMBERS' | 'SUBSCRIBERS' | 'ALL'
): Promise<ActionResult<{ recipientCount: number }>> {
    const denied = await checkAdmin();
    if (denied) return denied;

    if (!subject.trim()) return fail('Add a subject line before sending.');

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

    const uniqueEmails = Array.from(new Set(emailList));

    if (uniqueEmails.length === 0) {
        return fail('Nobody is in the selected group yet.');
    }

    const result = await sendBccEmail(uniqueEmails, subject, htmlBody);

    if (result.failed > 0) {
        return fail(
            result.succeeded > 0
                ? `Sent to ${result.succeeded} recipients, but ${result.failed} could not be reached. Check the Resend dashboard before resending.`
                : 'The email could not be sent. Check the Resend API key and sending limits on the live server.'
        );
    }

    return { success: true, recipientCount: result.succeeded };
}
