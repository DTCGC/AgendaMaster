/**
 * The signed-in Toastmaster's Google access token, server-side only.
 *
 * The token carries gmail.send, so it is deliberately NOT copied into the
 * session object (which /api/auth/session hands to the browser). Server code
 * reads it straight from the encrypted session cookie instead.
 *
 * Google access tokens expire after about an hour while sessions last 30
 * days, so an expired token is refreshed here with the refresh token stored
 * at sign-in (that is what `access_type: 'offline'` + `prompt: 'consent'` in
 * auth.ts are for). Google refresh tokens are reusable, so the refreshed
 * token does not need to be written back to the cookie.
 */
import { cookies, headers } from 'next/headers'
import { getToken } from 'next-auth/jwt'
import { google } from 'googleapis'

/** Refresh a minute early so a token can't expire mid-pipeline. */
const EXPIRY_MARGIN_MS = 60 * 1000

/** @returns A usable access token, or null when the session holds no Google credential. */
export async function getGoogleAccessToken(): Promise<string | null> {
  const cookieStore = await cookies()
  const secureCookie = cookieStore.getAll().some((c) => c.name.startsWith('__Secure-authjs.session-token'))
  const token = await getToken({
    req: { headers: await headers() },
    secret: process.env.AUTH_SECRET,
    secureCookie,
  })
  if (!token?.accessToken) return null

  const fresh = !token.accessTokenExpires || token.accessTokenExpires - EXPIRY_MARGIN_MS > Date.now()
  if (fresh || !token.refreshToken) return token.accessToken

  try {
    const client = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET)
    client.setCredentials({ refresh_token: token.refreshToken })
    const { token: refreshed } = await client.getAccessToken()
    return refreshed ?? null
  } catch (error) {
    // Revoked access or a changed password: the caller asks them to sign in again.
    console.error('[GoogleToken] Could not refresh the Google access token:', error)
    return null
  }
}
