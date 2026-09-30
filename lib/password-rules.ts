/**
 * Email/password validation rules, shared by the signup form (client) and
 * lib/password-auth.ts (server) so both always agree. No server-only imports.
 */

export const MIN_PASSWORD_LENGTH = 8
/** bcrypt silently ignores everything past 72 bytes — refuse rather than truncate. */
export const MAX_PASSWORD_LENGTH = 72

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/**
 * Canonical form of an email address. SQLite's unique index is case-sensitive
 * and Google always hands us lowercase addresses, so without this the same
 * person could end up with two accounts ("Sam@x.com" and "sam@x.com").
 */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

export function isValidEmail(email: string): boolean {
  return EMAIL_PATTERN.test(email)
}

/** @returns A user-facing error, or null when the password is acceptable. */
export function validateNewPassword(password: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Your password must be at least ${MIN_PASSWORD_LENGTH} characters long.`
  }
  if (new TextEncoder().encode(password).length > MAX_PASSWORD_LENGTH) {
    return `Your password is too long — please keep it under ${MAX_PASSWORD_LENGTH} characters.`
  }
  return null
}
