/**
 * Force Sign Out
 *
 * Rendered when a server component detects that the authenticated user no
 * longer corresponds to an active member (e.g. their account was deleted
 * while they were using the app). The edge middleware still trusts the stale
 * MEMBER cookie, so a server redirect would bounce back — clearing the cookie
 * via signOut() is the only reliable way to evict the session.
 */
'use client'

import { useEffect } from 'react'
import { signOut } from 'next-auth/react'

export default function ForceSignOut() {
  useEffect(() => {
    signOut({ callbackUrl: '/login' })
  }, [])

  return (
    <div className="flex-1 flex items-center justify-center p-8 text-gray-400 text-sm">
      Your session is no longer valid. Signing you out…
    </div>
  )
}
