/**
 * Communications Server Actions
 *
 * Handles mass email dispatch from the admin Broadcast panel.
 * Segments recipients into MEMBERS (active users), SUBSCRIBERS (guest waitlist),
 * or ALL (both). Sent as one BCC email from the club's Gmail via
 * lib/email.ts, with optional file attachments.
 */
'use server'

import { db } from '@/lib/db'
import { sendBccEmail, emailFailureReason, MAX_RECIPIENTS_PER_EMAIL, type EmailAttachment } from '@/lib/email'
import { checkAttachments, cleanAttachmentName } from '@/lib/email-limits'
import { fetchLinkPreview, isPreviewError, type LinkPreview } from '@/lib/link-preview'
import { normalizeWebUrl } from '@/lib/web-url'
import { normalizeEmail, isValidEmail } from '@/lib/password-rules'
import { checkAdmin } from '@/lib/auth-guard'
import { fail, type ActionResult } from '@/lib/action-result'

export type BroadcastTarget = 'MEMBERS' | 'SUBSCRIBERS' | 'ALL'

const TARGETS: readonly BroadcastTarget[] = ['MEMBERS', 'SUBSCRIBERS', 'ALL']

function isTarget(value: unknown): value is BroadcastTarget {
    return TARGETS.includes(value as BroadcastTarget)
}

/**
 * Everyone in the target group, once each. Addresses are compared lowercased
 * (a member who is also a subscriber under different capitalisation would
 * otherwise get two copies), and malformed ones are dropped: Gmail refuses
 * the whole email if any address in it is malformed.
 */
async function collectRecipients(targetGroup: BroadcastTarget) {
    let emailList: string[] = []

    if (targetGroup === 'MEMBERS' || targetGroup === 'ALL') {
        const members = await db.user.findMany({
            where: { role: { in: ['MEMBER', 'ADMIN'] } },
            select: { email: true }
        })
        emailList = emailList.concat(members.map(m => m.email))
    }

    if (targetGroup === 'SUBSCRIBERS' || targetGroup === 'ALL') {
        const subscribers = await db.subscriber.findMany({
            select: { email: true }
        })
        emailList = emailList.concat(subscribers.map(s => s.email))
    }

    const normalized = Array.from(new Set(emailList.map(normalizeEmail)))
    const valid = normalized.filter(isValidEmail)
    return { recipients: valid, skipped: normalized.length - valid.length }
}

export type BroadcastAudience = {
    recipientCount: number
    /** The most one email can go to; a bigger group can't be sent. */
    maxRecipients: number
}

/** How many people a broadcast to `targetGroup` reaches. */
export async function getBroadcastAudience(targetGroup: BroadcastTarget): Promise<ActionResult<{ audience: BroadcastAudience }>> {
    const denied = await checkAdmin()
    if (denied) return denied
    if (!isTarget(targetGroup)) return fail('Choose who to send to.')

    const { recipients } = await collectRecipients(targetGroup)
    return {
        success: true,
        audience: {
            recipientCount: recipients.length,
            maxRecipients: MAX_RECIPIENTS_PER_EMAIL,
        },
    }
}

/**
 * Dispatches a mass email to the selected target group. Admin only: this
 * sends arbitrary HTML from the club's address to everyone on file.
 *
 * Takes FormData so files can come along:
 *   subject     - Email subject line.
 *   htmlBody    - Rich HTML email body (from the Tiptap editor).
 *   targetGroup - Recipient segment: 'MEMBERS', 'SUBSCRIBERS', or 'ALL'.
 *   attachments - Zero or more files (limits in lib/email-limits.ts).
 */
export async function dispatchMassComms(
    formData: FormData
): Promise<ActionResult<{ recipientCount: number; skipped: number }>> {
    const denied = await checkAdmin();
    if (denied) return denied;

    const subject = String(formData.get('subject') ?? '').trim();
    const htmlBody = String(formData.get('htmlBody') ?? '');
    const targetGroup = formData.get('targetGroup');

    if (!subject) return fail('Add a subject line before sending.');
    if (!isTarget(targetGroup)) return fail('Choose who to send to.');

    const files = formData.getAll('attachments').filter((f): f is File => f instanceof File);
    const problem = checkAttachments(files);
    if (problem) return fail(problem);

    const { recipients, skipped } = await collectRecipients(targetGroup);

    if (recipients.length === 0) {
        return fail('Nobody is in the selected group yet.');
    }

    if (recipients.length > MAX_RECIPIENTS_PER_EMAIL) {
        return fail(`This group has ${recipients.length} recipients, and Gmail sends one email to at most ${MAX_RECIPIENTS_PER_EMAIL}. Send to a smaller group.`);
    }

    const attachments: EmailAttachment[] = await Promise.all(files.map(async (file) => ({
        filename: cleanAttachmentName(file.name),
        content: Buffer.from(await file.arrayBuffer()),
        ...(file.type ? { contentType: file.type } : {}),
    })));

    let recipientCount: number;
    try {
        recipientCount = await sendBccEmail(recipients, subject, htmlBody, { attachments });
    } catch (error) {
        console.error('Broadcast failed:', error);
        return fail(emailFailureReason(error));
    }

    return { success: true, recipientCount, skipped };
}

/** Reads a page's title, image and description for a link card in the email. */
export async function getLinkPreview(url: string): Promise<ActionResult<{ preview: LinkPreview }>> {
    const denied = await checkAdmin();
    if (denied) return denied;

    const target = normalizeWebUrl(url);
    if (!target) return fail('Enter a full web address, like https://example.com/page.');

    try {
        return { success: true, preview: await fetchLinkPreview(target) };
    } catch (error) {
        console.warn(`Link preview failed for ${target}:`, error);
        return fail(isPreviewError(error)
            ? `No preview: ${error.message}`
            : "That page couldn't be reached to build a preview.");
    }
}
