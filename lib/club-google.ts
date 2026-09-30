/**
 * Club Google Account Connection
 *
 * Members who registered with email + password have no Google identity, so
 * when one of them is Toastmaster the agenda sheet is created in — and the
 * agenda email sent from — the club's own Google account instead.
 *
 * An admin connects that account once by signing in with Google as
 * CLUB_GOOGLE_EMAIL from the Member Management page; the jwt callback in
 * auth.ts hands the resulting refresh token to saveClubGoogleConnection().
 * It lives in the Settings table (not .env) so reconnecting never needs a
 * redeploy or a trip to the Droplet.
 *
 * The OAuth consent screen must stay "In production": in "Testing" status
 * Google expires refresh tokens after 7 days.
 */
import { google } from 'googleapis'
import { db } from '@/lib/db'

/** The club's shared Google account (also the seeded ADMIN credential's email). */
export const CLUB_GOOGLE_EMAIL = 'coquitlamgavel@gmail.com'

const REFRESH_TOKEN_KEY = 'clubGoogleRefreshToken'
const CONNECTED_AT_KEY = 'clubGoogleConnectedAt'

export const CLUB_GOOGLE_NOT_CONNECTED_MESSAGE =
  "The club's Google account isn't connected (or the connection was revoked), so the agenda can't be created on your behalf. Please ask an executive to reconnect it on the Member Management page, then try again."

/** Thrown when the club account can't produce an access token. Message is user-facing. */
export class ClubGoogleUnavailableError extends Error {
  constructor() {
    super(CLUB_GOOGLE_NOT_CONNECTED_MESSAGE)
    this.name = 'ClubGoogleUnavailableError'
  }
}

/** Stores (or replaces) the club account's refresh token. */
export async function saveClubGoogleConnection(refreshToken: string) {
  const connectedAt = new Date().toISOString()
  await db.$transaction([
    db.settings.upsert({
      where: { key: REFRESH_TOKEN_KEY },
      create: { key: REFRESH_TOKEN_KEY, value: refreshToken },
      update: { value: refreshToken },
    }),
    db.settings.upsert({
      where: { key: CONNECTED_AT_KEY },
      create: { key: CONNECTED_AT_KEY, value: connectedAt },
      update: { value: connectedAt },
    }),
  ])
}

/** Whether a club connection is stored, and when it was made. Does not call Google. */
export async function getClubGoogleStatus(): Promise<{ connected: boolean; connectedAt: Date | null }> {
  const rows = await db.settings.findMany({
    where: { key: { in: [REFRESH_TOKEN_KEY, CONNECTED_AT_KEY] } },
  })
  const token = rows.find((r) => r.key === REFRESH_TOKEN_KEY)?.value
  const connectedAt = rows.find((r) => r.key === CONNECTED_AT_KEY)?.value
  return {
    connected: !!token,
    connectedAt: connectedAt ? new Date(connectedAt) : null,
  }
}

/**
 * Exchanges the stored refresh token for a short-lived access token carrying
 * the same scopes members grant (drive.file + gmail.send).
 *
 * @throws ClubGoogleUnavailableError when not connected or Google refuses the token.
 */
export async function getClubAccessToken(): Promise<string> {
  const row = await db.settings.findUnique({ where: { key: REFRESH_TOKEN_KEY } })
  if (!row?.value) throw new ClubGoogleUnavailableError()

  const client = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET)
  client.setCredentials({ refresh_token: row.value })

  try {
    const { token } = await client.getAccessToken()
    if (!token) throw new ClubGoogleUnavailableError()
    return token
  } catch (error) {
    // invalid_grant = revoked, password changed, or expired (Testing status).
    console.error('[ClubGoogle] Could not refresh the club access token:', error)
    throw new ClubGoogleUnavailableError()
  }
}
