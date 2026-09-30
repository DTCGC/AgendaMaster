/**
 * Which Google credential an agenda-pipeline caller runs under.
 *
 * Pure so the routing is testable — getting it wrong is silent (the wrong
 * account touches the sheet) until Google answers with a 403/404.
 */

export type GoogleAuthPath =
  /** The caller's own Google OAuth token: a Toastmaster who signed in with Google. */
  | { kind: 'user-token'; accessToken: string }
  /**
   * The app's service account, for updates to an existing sheet. `clubCreate`
   * says whether this caller may also CREATE a sheet (and send the agenda
   * email) through the club's connected Google account.
   */
  | { kind: 'service-account'; clubCreate: boolean }
  /** No usable credential. */
  | { kind: 'none' }

export function resolveGoogleAuthPath(caller: {
  role?: string
  authMethod?: 'google' | 'credentials'
  accessToken?: string | null
}): GoogleAuthPath {
  // ADMIN always goes through the service account, even when holding a token.
  // An admin who connected the club account is signed in with the CLUB's
  // Google token, and its drive.file scope cannot see sheets that live in the
  // Toastmasters' own Drives. Admins also never create sheets.
  if (caller.role === 'ADMIN') {
    return { kind: 'service-account', clubCreate: false }
  }

  // A member who registered with email + password has no Google identity.
  // Decided by HOW they signed in, never by a missing token: a Google member
  // whose token went missing must be told to sign in again, not silently
  // routed through the club's account.
  if (caller.role === 'MEMBER' && caller.authMethod === 'credentials') {
    return { kind: 'service-account', clubCreate: true }
  }

  if (caller.accessToken) {
    return { kind: 'user-token', accessToken: caller.accessToken }
  }

  return { kind: 'none' }
}
