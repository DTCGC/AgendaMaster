/**
 * Server Action Authorization Guards
 *
 * Centralizes role checks for server actions. Server actions are publicly
 * callable POST endpoints — being rendered only on an admin page does NOT
 * stop an authenticated non-admin from invoking them with crafted FormData.
 * Every admin-only mutation must verify the caller's role server-side.
 *
 * `require*` guards throw (fine for form actions with no result to show);
 * `check*` guards return an ActionFailure for actions that report errors.
 */
import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import { fail, type ActionFailure } from './action-result'
import { meetingEditDenial } from './meeting-access'

const ADMIN_REQUIRED = 'Unauthorized: administrator access required.'

/**
 * Asserts that the current session belongs to an ADMIN.
 * Throws if there is no session or the user is not an admin.
 *
 * @returns The authenticated admin session.
 */
export async function requireAdmin() {
  const session = await auth()
  if (session?.user?.role !== 'ADMIN') {
    throw new Error(ADMIN_REQUIRED)
  }
  return session
}

/** Non-throwing requireAdmin: null when the caller is an admin, otherwise a failure to return. */
export async function checkAdmin(): Promise<ActionFailure | null> {
  const session = await auth()
  return session?.user?.role === 'ADMIN' ? null : fail(ADMIN_REQUIRED)
}

/**
 * Page-level admin gate: sends anyone else to their dashboard. The edge
 * middleware checks the cookie's role, which can be stale; this re-reads it.
 */
export async function pageRequireAdmin() {
  const session = await auth()
  if (session?.user?.role !== 'ADMIN') redirect('/agenda')
  return session
}

/**
 * Asserts that the current session belongs to an approved club account —
 * either a MEMBER or an ADMIN. Throws for PENDING/DELETED accounts and for
 * callers with no session at all.
 *
 * @returns The authenticated member or admin session.
 */
export async function requireMember() {
  const session = await auth()
  const role = session?.user?.role
  if (role !== 'MEMBER' && role !== 'ADMIN') {
    throw new Error('Unauthorized: club membership required.')
  }
  return session
}

/**
 * Asserts that the caller may edit this meeting's agenda: an ADMIN, or the
 * meeting's own Toastmaster while it is still editable (lib/meeting-access.ts).
 */
export async function requireMeetingEditor(meetingId: string) {
  const session = await auth()
  const denial = await meetingEditDenial(session?.user, meetingId)
  if (denial) throw new Error(denial)
  return session!
}
