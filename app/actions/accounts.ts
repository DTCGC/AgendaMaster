'use server'

import { db } from '@/lib/db'
import { quietlySendEmail } from '@/lib/email'
import { revalidatePath } from 'next/cache'
export async function approveAccount(formData: FormData) {
  const userId = formData.get('userId') as string;
  const user = await db.user.update({
    where: { id: userId },
    data: { role: 'MEMBER' }
  });

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
        <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;" />
        <p style="font-size: 12px; color: #666;">This is an automated message from the DTCGC Agenda Workflow Engine.</p>
      </div>
    </div>
  `;
  
  await quietlySendEmail(user.email, subject, html);
  revalidatePath('/admin/accounts');
}

export async function rejectAccount(formData: FormData) {
  const userId = formData.get('userId') as string;
  const user = await db.user.findUnique({
    where: { id: userId }
  });

  if (!user) return;

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
        <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;" />
        <p style="font-size: 12px; color: #666;">This is an automated message from the DTCGC Agenda Workflow Engine.</p>
      </div>
    </div>
  `;

  await quietlySendEmail(user.email, subject, html);

  await db.user.delete({
    where: { id: userId }
  });

  revalidatePath('/admin/accounts');
}

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

export async function removeUser(formData: FormData) {
  const userId = formData.get('userId') as string;
  await db.user.delete({
    where: { id: userId }
  });
  revalidatePath('/admin/accounts');
}

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
