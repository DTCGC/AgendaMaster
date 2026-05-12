/**
 * Account Management Server Actions
 *
 * Handles the full member lifecycle from the admin Accounts panel:
 *   - Approve / Reject pending registrations (with email notifications)
 *   - Retry failed email notifications (with completion of deferred operations)
 *   - Guest mailing list subscription
 *   - User removal (soft-unlinking from roles, then hard delete)
 *   - Admin name correction
 */
'use server'

import { db } from '@/lib/db'
import { quietlySendEmail } from '@/lib/email'
import { revalidatePath } from 'next/cache'

/**
 * Approves a pending user registration.
 * Transitions PENDING → MEMBER and sends a welcome email.
 *
 * If the email fails, returns `emailError: true` so the UI can show
 * a retry modal (the DB update is NOT rolled back — approval persists).
 */
export async function approveAccount(prevState: any, formData: FormData) {
  const userId = formData.get('userId') as string;
  let user;
  
  try {
    user = await db.user.update({
      where: { id: userId },
      data: { role: 'MEMBER' }
    });
  } catch (error) {
    console.error("Database update failed:", error);
    return { success: false, error: "Database error. Could not approve user." };
  }

  const subject = "Welcome to the Downtown Coquitlam Gavel Club Portal";
  const html = `
    <div style="font-family: 'Montserrat', sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background: #004165; color: white; padding: 24px; border-radius: 12px 12px 0 0;">
        <h2 style="margin: 0;">Account Approved ✓</h2>
      </div>
      <div style="padding: 24px; background: #f8f9fa; border-radius: 0 0 12px 12px; border: 1px solid #eee;">
        <p>Hi ${user.firstName},</p>
        <p>Your portal account has been verified and fully approved by the club administrative team.</p>
        <p>You can now log in at any time to view upcoming agendas and your assigned operations.</p>
        <p><a href="https://agendas.coquitlamgavel.com" style="display: inline-block; background-color: #004165; color: white; padding: 10px 20px; text-decoration: none; border-radius: 6px; font-weight: bold; margin-top: 10px;">Access Portal</a></p>
        <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;" />
        <p style="font-size: 12px; color: #666;">This is an automated message from the DTCGC Agenda Workflow Engine.</p>
      </div>
    </div>
  `;
  
  try {
    await quietlySendEmail(user.email, subject, html);
    // Email succeeded — safe to refresh the page
    revalidatePath('/admin/accounts');
    return { success: true, emailError: false };
  } catch (error) {
    console.error("Approval email failed:", error);
    // Keep page mounted (no revalidate) so the retry modal can render
    return { success: true, emailError: true, type: 'approval', userId: user.id, errorId: Date.now() };
  }
}

/**
 * Rejects a pending user registration.
 * Sends a denial email first, then deletes the user record.
 *
 * If the email fails, the user is NOT deleted yet — the retry
 * mechanism will complete both the email and deletion.
 */
export async function rejectAccount(prevState: any, formData: FormData) {
  const userId = formData.get('userId') as string;
  const user = await db.user.findUnique({
    where: { id: userId }
  });

  if (!user) return { success: false, error: "User not found." };

  const subject = "DTCGC Account Application Update";
  const html = `
    <div style="font-family: 'Montserrat', sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background: #772432; color: white; padding: 24px; border-radius: 12px 12px 0 0;">
        <h2 style="margin: 0;">Application Update</h2>
      </div>
      <div style="padding: 24px; background: #f8f9fa; border-radius: 0 0 12px 12px; border: 1px solid #eee;">
        <p>Hi ${user.firstName},</p>
        <p>Unfortunately, your portal access request has been declined at this time.</p>
        <p>If you believe this was in error, please contact the VP of Education directly.</p>
        <p>Return to <a href="https://agendas.coquitlamgavel.com" style="color: #772432; font-weight: bold;">agendas.coquitlamgavel.com</a></p>
        <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;" />
        <p style="font-size: 12px; color: #666;">This is an automated message from the DTCGC Agenda Workflow Engine.</p>
      </div>
    </div>
  `;

  try {
    await quietlySendEmail(user.email, subject, html);
    // Email sent — now safe to delete the rejected user record
    await db.user.delete({ where: { id: userId } });
    revalidatePath('/admin/accounts');
    return { success: true, emailError: false };
  } catch (error) {
    console.error("Rejection email failed:", error);
    // DO NOT delete user yet and DO NOT revalidate — retry modal will handle it
    return { success: false, emailError: true, type: 'rejection', userId: user.id, errorId: Date.now() };
  }
}

/**
 * Retries sending an email for a user whose notification failed.
 * If it was a rejection, it also finishes the deletion.
 */
export async function retryAccountEmail(userId: string, type: 'approval' | 'rejection') {
  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user) return { success: false, error: 'User no longer exists.' };

  const isApproval = type === 'approval';
  const subject = isApproval 
    ? "Welcome to the Downtown Coquitlam Gavel Club Portal"
    : "DTCGC Account Application Update";

  const color = isApproval ? '#004165' : '#772432';
  const title = isApproval ? 'Account Approved ✓' : 'Application Update';
  const body = isApproval 
    ? `<p>Your portal account has been verified and fully approved by the club administrative team.</p>
       <p>You can now log in at any time to view upcoming agendas and your assigned operations.</p>
       <p><a href="https://agendas.coquitlamgavel.com" style="display: inline-block; background-color: #004165; color: white; padding: 10px 20px; text-decoration: none; border-radius: 6px; font-weight: bold; margin-top: 10px;">Access Portal</a></p>`
    : `<p>Unfortunately, your portal access request has been declined at this time.</p>
       <p>If you believe this was in error, please contact the VP of Education directly.</p>
       <p>Return to <a href="https://agendas.coquitlamgavel.com" style="color: #772432; font-weight: bold;">agendas.coquitlamgavel.com</a></p>`;

  const html = `
    <div style="font-family: 'Montserrat', sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background: ${color}; color: white; padding: 24px; border-radius: 12px 12px 0 0;">
        <h2 style="margin: 0;">${title}</h2>
      </div>
      <div style="padding: 24px; background: #f8f9fa; border-radius: 0 0 12px 12px; border: 1px solid #eee;">
        <p>Hi ${user.firstName},</p>
        ${body}
        <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;" />
        <p style="font-size: 12px; color: #666;">This is an automated message from the DTCGC Agenda Workflow Engine.</p>
      </div>
    </div>
  `;

  try {
    await quietlySendEmail(user.email, subject, html);
    if (!isApproval) {
      await db.user.delete({ where: { id: userId } });
    }
    revalidatePath('/admin/accounts');
    return { success: true };
  } catch (error) {
    console.error("Retry failed:", error);
    return { success: false, error: "Email still failing. Check system SMTP logs." };
  }
}


/** Adds a guest email to the mailing list (subscriber table). */
export async function subscribeGuest(email: string) {
  try {
    await db.subscriber.create({
      data: { email }
    });
    return { success: true };
  } catch (error) {
    console.error("Subscription error:", error);
    return { success: false, error: "Email already subscribed or invalid." };
  }
}

/**
 * Removes an active member from the system.
 * Soft-unlinks role assignments (sets userId=null) before hard-deleting
 * the user record, preserving historical meeting data.
 */
export async function removeUser(formData: FormData) {
  const userId = formData.get('userId') as string;
  
  try {
    // Unlink the user from any past or future agenda roles to prevent FK constraint errors
    await db.roleAssignment.updateMany({
      where: { userId: userId },
      data: { userId: null }
    });

    await db.user.delete({
      where: { id: userId }
    });
  } catch (error) {
    console.error("Failed to remove user:", error);
  }
  
  revalidatePath('/admin/accounts');
}

/** Removes a guest subscriber from the mailing list. */
export async function removeSubscriber(formData: FormData) {
  const subscriberId = formData.get('subscriberId') as string;
  await db.subscriber.delete({
    where: { id: subscriberId }
  });
  revalidatePath('/admin/accounts');
}

/**
 * Allows admins to correct a member's first and last name.
 * Used to fix names inherited from parent Google accounts or typos.
 */
export async function updateUserName(formData: FormData) {
  const userId = formData.get('userId') as string;
  const firstName = (formData.get('firstName') as string)?.trim();
  const lastName = (formData.get('lastName') as string)?.trim();

  if (!firstName || !lastName) {
    throw new Error('Both first and last name are required.');
  }

  const namePattern = /^[a-zA-Z\s\-']+$/;
  if (!namePattern.test(firstName) || !namePattern.test(lastName)) {
    throw new Error('Names may only contain letters, spaces, hyphens, and apostrophes.');
  }

  await db.user.update({
    where: { id: userId },
    data: { firstName, lastName }
  });

  revalidatePath('/admin/accounts');
}
