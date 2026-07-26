/**
 * Server Action Authorization Guards
 *
 * Centralizes role checks for server actions. Server actions are publicly
 * callable POST endpoints — being rendered only on an admin page does NOT
 * stop an authenticated non-admin from invoking them with crafted FormData.
 * Every admin-only mutation must verify the caller's role server-side.
 */
import { auth } from '@/auth'

/**
 * Asserts that the current session belongs to an ADMIN.
 * Throws if there is no session or the user is not an admin.
 *
 * @returns The authenticated admin session.
 */
export async function requireAdmin() {
  const session = await auth()
  if (session?.user?.role !== 'ADMIN') {
    throw new Error('Unauthorized: administrator access required.')
  }
  return session
}

/**
 * Asserts that the current session belongs to an approved club account —
 * either a MEMBER or an ADMIN. Throws for PENDING/DELETED accounts and for
 * callers with no session at all.
 *
 * Use this for mutations any club member may legitimately perform (such as
 * the Toastmaster finalizing a roster), where `requireAdmin` would be too
 * strict but "publicly callable" is far too loose.
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
