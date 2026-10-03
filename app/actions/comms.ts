/**
 * Communications Server Actions
 *
 * Handles mass email dispatch from the admin Broadcast panel.
 * Segments recipients into MEMBERS (active users), SUBSCRIBERS (guest waitlist),
 * or ALL (both). Uses BCC delivery via lib/email.ts, with optional file
 * attachments, and checks Resend's daily quota before anything goes out.
 */
'use server'

import { db } from '@/lib/db'
import { sendBccEmail, bccQuotaCost, type EmailAttachment } from '@/lib/email'
import { dailyLimit, remainingToday, quotaResetsAt } from '@/lib/email-quota'
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
 * otherwise get two copies), and malformed ones are dropped: a hard bounce
 * counts against Resend's 4% bounce-rate limit, past which it pauses sending.
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

/** "5:00 PM": when Resend's quota day (midnight UTC) ends, in club time. */
function resetTime(): string {
    return quotaResetsAt().toLocaleTimeString('en-CA', { timeZone: 'America/Vancouver', hour: 'numeric', minute: '2-digit' })
}

export type BroadcastAudience = {
    recipientCount: number
    /** Daily-quota units this broadcast would use (recipients plus one per batch). */
    quotaCost: number
    /** Units left today, or null when the plan has no daily limit. */
    remainingToday: number | null
    dailyLimit: number | null
    resetsAt: string
}

/** How many people a broadcast to `targetGroup` reaches, and whether today's quota covers it. */
export async function getBroadcastAudience(targetGroup: BroadcastTarget): Promise<ActionResult<{ audience: BroadcastAudience }>> {
    const denied = await checkAdmin()
    if (denied) return denied
    if (!isTarget(targetGroup)) return fail('Choose who to send to.')

    const { recipients } = await collectRecipients(targetGroup)
    return {
        success: true,
        audience: {
            recipientCount: recipients.length,
            quotaCost: bccQuotaCost(recipients.length),
            remainingToday: await remainingToday(),
            dailyLimit: dailyLimit(),
            resetsAt: resetTime(),
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

    // Refuse up front rather than reach half the club and stop.
    const cost = bccQuotaCost(recipients.length);
    const limit = dailyLimit();
    if (limit !== null && cost > limit) {
        return fail(`This group has ${recipients.length} recipients, and Resend's plan allows only ${limit} emails a day (each recipient counts as one). Send to a smaller group, or upgrade the Resend plan and set RESEND_DAILY_LIMIT on the server.`);
    }
    const remaining = await remainingToday();
    if (remaining !== null && cost > remaining) {
        return fail(`Not enough of today's email allowance is left: this needs ${cost} and about ${remaining} remain. The allowance resets at ${resetTime()} (Pacific). Nothing was sent.`);
    }

    const attachments: EmailAttachment[] = await Promise.all(files.map(async (file) => ({
        filename: cleanAttachmentName(file.name),
        content: Buffer.from(await file.arrayBuffer()),
        ...(file.type ? { contentType: file.type } : {}),
    })));

    const result = await sendBccEmail(recipients, subject, htmlBody, { attachments });

    if (result.failed > 0) {
        if (result.quotaExhausted) {
            return fail(
                result.succeeded > 0
                    ? `Resend's email allowance ran out partway: ${result.succeeded} recipients got the email and ${result.failed} did not. It resets at ${resetTime()} (Pacific). Check the Resend dashboard for who was reached before sending again.`
                    : `Resend's email allowance is used up, so nothing was sent. It resets at ${resetTime()} (Pacific).`
            );
        }
        return fail(
            result.succeeded > 0
                ? `Sent to ${result.succeeded} recipients, but ${result.failed} could not be reached. Check the Resend dashboard before resending.`
                : 'The email could not be sent. Check the Resend API key and sending limits on the live server.'
        );
    }

    return { success: true, recipientCount: result.succeeded, skipped };
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
