'use server'

import { auth } from '@/auth'
import { db } from '@/lib/db'
import { redirect } from 'next/navigation'

/**
 * Completes a new member's profile by saving their self-reported name.
 * Transitions role from INCOMPLETE → PENDING (enters the admin approval queue).
 * 
 * This decouples the user's club identity from whatever name is on
 * the Google account they used to authenticate.
 */
export async function completeProfile(formData: FormData) {
  const session = await auth();

  if (!session?.user?.dbId) {
    redirect('/login');
  }

  // Verify the user is still INCOMPLETE
  const user = await db.user.findUnique({
    where: { id: session.user.dbId },
    select: { role: true }
  });

  if (!user || user.role !== 'INCOMPLETE') {
    redirect('/pending');
  }

  const firstName = (formData.get('firstName') as string)?.trim();
  const lastName = (formData.get('lastName') as string)?.trim();

  // Server-side validation
  if (!firstName || !lastName) {
    throw new Error('First name and last name are required.');
  }

  // Only allow letters, spaces, hyphens, and apostrophes
  const namePattern = /^[a-zA-Z\s\-']+$/;
  if (!namePattern.test(firstName) || !namePattern.test(lastName)) {
    throw new Error('Names may only contain letters, spaces, hyphens, and apostrophes.');
  }

  // Commit the user's real name and advance to PENDING
  await db.user.update({
    where: { id: session.user.dbId },
    data: {
      firstName,
      lastName,
      role: 'PENDING',
    }
  });

  redirect('/pending');
}
