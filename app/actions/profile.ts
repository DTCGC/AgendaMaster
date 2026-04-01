'use server'

import { auth } from '@/auth'
import { db } from '@/lib/db'

/**
 * Completes a new member's profile by saving their self-reported name.
 * Transitions role from INCOMPLETE → PENDING (enters the admin approval queue).
 * 
 * This decouples the user's club identity from whatever name is on
 * the Google account they used to authenticate.
 * 
 * Returns a result object instead of using redirect() to avoid
 * Next.js redirect errors being caught by client-side try/catch.
 */
export async function completeProfile(formData: FormData): Promise<{ success: boolean; error?: string }> {
  const session = await auth();

  if (!session?.user?.dbId) {
    return { success: false, error: 'Session expired. Please sign in again.' };
  }

  // Verify the user is still INCOMPLETE
  const user = await db.user.findUnique({
    where: { id: session.user.dbId },
    select: { role: true }
  });

  if (!user || user.role !== 'INCOMPLETE') {
    // Already completed — the client will redirect to /pending
    return { success: true };
  }

  const firstName = (formData.get('firstName') as string)?.trim();
  const lastName = (formData.get('lastName') as string)?.trim();

  // Server-side validation
  if (!firstName || !lastName) {
    return { success: false, error: 'First name and last name are required.' };
  }

  // Only allow letters, spaces, hyphens, and apostrophes
  const namePattern = /^[a-zA-Z\s\-']+$/;
  if (!namePattern.test(firstName) || !namePattern.test(lastName)) {
    return { success: false, error: 'Names may only contain letters, spaces, hyphens, and apostrophes.' };
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

  return { success: true };
}
