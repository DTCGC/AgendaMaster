/**
 * Account Management Server Actions
 *
 * Handles the full member lifecycle from the admin Accounts panel:
 *   - Approve / Reject pending registrations (with email notifications)
 *   - Retry failed email notifications (with completion of deferred operations)
 *   - Guest mailing list subscription
 *   - User removal (soft-unlinking from roles, then hard delete)
 *   - Admin name correction
 *   - Connecting the club's Google account (used for members without Google)
 */
'use server'

import { db } from '@/lib/db'
import { sendEmail } from '@/lib/email'
import { accountEmail, type AccountEmailKind } from '@/lib/email-templates'
import { revalidatePath } from 'next/cache'
import { requireAdmin, checkAdmin } from '@/lib/auth-guard'
import { signIn } from '@/auth'
import { CLUB_GOOGLE_EMAIL } from '@/lib/club-google'
import { normalizeEmail, isValidEmail } from '@/lib/password-rules'
import { validatePersonName } from '@/lib/name-rules'
import { revalidateMeetingViews } from '@/lib/revalidate'
import { fail, type ActionResult, type ActionFailure } from '@/lib/action-result'

/** `emailError` means the account change went through but its notification didn't. */
export type AccountDecisionResult =
  | { success: true; emailError?: boolean }
  | (ActionFailure & { emailError?: boolean })

/**
 * Approves a pending user registration.
 * Transitions PENDING → MEMBER and sends a welcome email.
 *
 * If the email fails, returns `emailError: true` so the UI can show
 * a retry modal (the approval itself is NOT rolled back).
 */
export async function approveAccount(userId: string): Promise<AccountDecisionResult> {
  const denied = await checkAdmin();
  if (denied) return denied;

  // Only a PENDING account can be approved — a crafted request must not be
  // able to promote an INCOMPLETE account or touch the admin.
  const { count } = await db.user.updateMany({
    where: { id: userId, role: 'PENDING' },
    data: { role: 'MEMBER' }
  });
  if (count === 0) return fail('That account is no longer waiting for approval.');

  const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
  const { subject, html } = accountEmail('approval', user.firstName);

  try {
    await sendEmail(user.email, subject, html);
  } catch (error) {
    console.error("Approval email failed:", error);
    // Keep page mounted (no revalidate) so the retry modal can render
    return { success: true, emailError: true };
  }

  revalidatePath('/admin/accounts');
  return { success: true };
}

/**
 * Rejects a pending user registration.
 * Sends a denial email first, then deletes the user record.
 *
 * If the email fails, the user is NOT deleted yet — the retry
 * mechanism will complete both the email and deletion.
 */
export async function rejectAccount(userId: string): Promise<AccountDecisionResult> {
  const denied = await checkAdmin();
  if (denied) return denied;

  const user = await db.user.findFirst({ where: { id: userId, role: 'PENDING' } });
  if (!user) return fail('That account is no longer waiting for approval.');

  const { subject, html } = accountEmail('rejection', user.firstName);
  try {
    await sendEmail(user.email, subject, html);
  } catch (error) {
    console.error("Rejection email failed:", error);
    // DO NOT delete user yet and DO NOT revalidate — retry modal will handle it
    return { ...fail('The rejection email could not be sent.'), emailError: true };
  }

  // Separate from the send: a failed delete must not make a retry send the
  // email a second time.
  const deleted = await deletePendingUser(userId);
  if (!deleted.success) return deleted;

  revalidatePath('/admin/accounts');
  return { success: true };
}

/** Deletes a still-PENDING account. Pending accounts hold no roles. */
async function deletePendingUser(userId: string): Promise<ActionResult> {
  try {
    await db.user.deleteMany({ where: { id: userId, role: 'PENDING' } });
    return { success: true };
  } catch (error) {
    console.error('Failed to delete rejected account:', error);
    return fail('The email was sent, but the account could not be removed. Remove it from the member list instead.');
  }
}

/**
 * Retries sending an email for a user whose notification failed.
 * If it was a rejection, it also finishes the deletion.
 */
export async function retryAccountEmail(userId: string, type: AccountEmailKind): Promise<ActionResult> {
  const denied = await checkAdmin();
  if (denied) return denied;

  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user) return fail('User no longer exists.');

  const { subject, html } = accountEmail(type, user.firstName);
  try {
    await sendEmail(user.email, subject, html);
  } catch (error) {
    console.error("Retry failed:", error);
    return fail('The email still could not be sent. Check the Resend dashboard for the reason.');
  }

  if (type === 'rejection') {
    const deleted = await deletePendingUser(userId);
    if (!deleted.success) return deleted;
  }
  revalidatePath('/admin/accounts');
  return { success: true };
}


/** Adds a guest email to the mailing list (subscriber table). Public. */
export async function subscribeGuest(email: string): Promise<ActionResult> {
  const address = normalizeEmail(email);
  if (!isValidEmail(address)) return fail('Please enter a valid email address.');

  try {
    // Upsert: subscribing twice is not an error worth showing a guest.
    await db.subscriber.upsert({
      where: { email: address },
      create: { email: address },
      update: {},
    });
    return { success: true };
  } catch (error) {
    console.error("Subscription error:", error);
    return fail('Something went wrong. Please try again later.');
  }
}

/**
 * Removes an active member from the system.
 * Soft-unlinks role assignments (sets userId=null) before hard-deleting
 * the user record, preserving historical meeting data.
 */
export async function removeUser(userId: string): Promise<ActionResult> {
  const session = await requireAdmin();

  const user = await db.user.findUnique({ where: { id: userId }, select: { role: true } });
  if (!user) return fail('That member no longer exists.');
  if (user.role === 'ADMIN' || userId === session?.user?.dbId) {
    return fail('Administrator accounts cannot be removed from here.');
  }

  try {
    await db.$transaction([
      // Unlink the user from any past or future agenda roles to prevent FK constraint errors
      db.roleAssignment.updateMany({ where: { userId }, data: { userId: null } }),
      db.user.delete({ where: { id: userId } }),
    ]);
  } catch (error) {
    console.error("Failed to remove user:", error);
    return fail('The member could not be removed. Please try again.');
  }

  revalidatePath('/admin/accounts');
  revalidateMeetingViews();
  return { success: true };
}

/** Removes a guest subscriber from the mailing list. */
export async function removeSubscriber(subscriberId: string): Promise<ActionResult> {
  await requireAdmin();

  await db.subscriber.deleteMany({ where: { id: subscriberId } });
  revalidatePath('/admin/accounts');
  return { success: true };
}

/**
 * Allows admins to correct a member's first and last name.
 * Used to fix names inherited from parent Google accounts or typos.
 */
export async function updateUserName(userId: string, firstName: string, lastName: string): Promise<ActionResult> {
  // Admin-only: anyone authenticated could otherwise rename arbitrary members.
  await requireAdmin();

  const problem = validatePersonName(firstName, lastName);
  if (problem) return fail(problem);

  await db.user.update({
    where: { id: userId },
    data: { firstName: firstName.trim(), lastName: lastName.trim() }
  });

  revalidatePath('/admin/accounts');
  revalidateMeetingViews();
  return { success: true };
}

/**
 * Starts a Google sign-in as the club account. When it completes, the jwt
 * callback in auth.ts stores the club's refresh token (lib/club-google.ts),
 * which is what lets members without Google create and email their agenda.
 * The admin stays signed in afterwards — as the ADMIN account, via Google.
 */
export async function connectClubGoogle() {
  await requireAdmin();
  await signIn('google', { redirectTo: '/admin/accounts' }, { login_hint: CLUB_GOOGLE_EMAIL });
}
