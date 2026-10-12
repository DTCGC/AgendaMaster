/**
 * The Google permissions the agenda pipeline needs, and how to tell when a
 * sign-in didn't grant them.
 *
 * Google's consent screen shows each of these as its own checkbox, and a
 * member can untick them and still sign in. Their token then works for
 * logging in but Google answers the first Sheets/Gmail call with a 403
 * "Request had insufficient authentication scopes." Pure, so it is testable.
 */

/** Requested at sign-in (auth.ts) alongside openid/email/profile. */
export const REQUIRED_GOOGLE_SCOPES = {
  'https://www.googleapis.com/auth/drive.file': 'create the agenda sheet in your Google Drive',
  'https://www.googleapis.com/auth/gmail.send': 'send the agenda email from your Gmail',
} as const

/**
 * The required scopes missing from a space-separated `scope` string as Google
 * returned it at sign-in. Null when the grant is unknown: sessions from before
 * the scope was recorded carry none, and those are caught by the 403 instead.
 */
export function missingGoogleScopes(granted: string | undefined | null): string[] | null {
  if (granted == null) return null
  const have = new Set(granted.split(/\s+/))
  return Object.keys(REQUIRED_GOOGLE_SCOPES).filter((s) => !have.has(s))
}

/** User-facing explanation. `missing` null = we only know Google refused. */
export function missingScopesMessage(missing: string[] | null): string {
  const descriptions = REQUIRED_GOOGLE_SCOPES as Record<string, string>
  const what = missing?.length
    ? missing.map((s) => descriptions[s] ?? s).join(' and ')
    : 'create the agenda sheet and send the agenda email'
  return `Google didn't give AgendaMaster permission to ${what}. This happens when a checkbox is left unticked on Google's sign-in screen. Please sign out, sign back in with Google, and tick every box on the permissions screen — then try again.`
}

/** True when a googleapis error is Google's "token lacks a scope" 403. */
export function isInsufficientScopeError(error: unknown): boolean {
  const e = error as {
    message?: string
    response?: { data?: { error?: { details?: { reason?: string }[] } } }
  }
  if (typeof e?.message === 'string' && /insufficient authentication scopes/i.test(e.message)) return true
  return !!e?.response?.data?.error?.details?.some((d) => d?.reason === 'ACCESS_TOKEN_SCOPE_INSUFFICIENT')
}
