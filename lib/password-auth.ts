/**
 * Email/Password Accounts
 *
 * The fallback login for the (rare) members who cannot use a Google account,
 * plus the club's shared ADMIN credential. Kept free of NextAuth so the rules
 * can be tested directly against a scratch database:
 *   - auth.ts's Credentials provider delegates to verifyPasswordLogin()
 *   - the /signup server action delegates to createPasswordAccount()
 *
 * A password account starts INCOMPLETE, exactly like a first Google sign-in,
 * so it flows through the same /complete-profile → PENDING → admin approval.
 */
import bcrypt from 'bcryptjs'
import { db } from '@/lib/db'
import { normalizeEmail, isValidEmail, validateNewPassword } from '@/lib/password-rules'

/** Same cost factor as the seeded admin credential (prisma/seed.ts). */
const BCRYPT_COST = 12

/**
 * Registers a new email/password account in the INCOMPLETE state.
 * Refuses any email that already has an account — including Google ones, so a
 * password can never be bolted onto someone else's Google-backed account.
 */
export async function createPasswordAccount(
  rawEmail: string,
  password: string
): Promise<{ success: true; userId: string } | { success: false; error: string }> {
  const email = normalizeEmail(rawEmail)

  if (!isValidEmail(email)) {
    return { success: false, error: 'Please enter a valid email address.' }
  }

  const passwordError = validateNewPassword(password)
  if (passwordError) {
    return { success: false, error: passwordError }
  }

  const existing = await db.user.findUnique({ where: { email }, select: { id: true } })
  if (existing) {
    return { success: false, error: 'An account with this email already exists — try signing in instead.' }
  }

  const passwordHash = await bcrypt.hash(password, BCRYPT_COST)
  try {
    const user = await db.user.create({
      data: { email, firstName: '', lastName: '', role: 'INCOMPLETE', passwordHash }
    })
    return { success: true, userId: user.id }
  } catch {
    // Lost a race with a simultaneous signup for the same address.
    return { success: false, error: 'An account with this email already exists — try signing in instead.' }
  }
}

/**
 * Checks an email/password pair. Any role may sign in this way as long as the
 * account HAS a password: that is the ADMIN credential and email-registered
 * members. Google-only accounts have no passwordHash and are always refused.
 *
 * @returns The NextAuth user payload, or null on any failure.
 */
export async function verifyPasswordLogin(rawEmail: string, password: string) {
  if (!rawEmail || !password) return null

  const user = await db.user.findUnique({ where: { email: normalizeEmail(rawEmail) } })
  if (!user?.passwordHash) return null

  const isValid = await bcrypt.compare(password, user.passwordHash)
  if (!isValid) return null

  return {
    id: user.id,
    email: user.email,
    name: `${user.firstName} ${user.lastName}`.trim(),
    role: user.role,
  }
}
