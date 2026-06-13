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
