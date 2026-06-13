/**
 * Approval Watcher
 *
 * Mounted on the /pending holding page. Polls syncSessionRole() to detect
 * when an admin has approved (or rejected/deleted) the waiting account, then
 * routes the user accordingly — no manual logout/login required.
 *
 * syncSessionRole() rewrites the JWT cookie with the freshly-revalidated
 * role, so the subsequent full-page navigation passes the edge middleware
 * cleanly (which otherwise still sees the stale PENDING role and would loop
 * the user back to /pending).
 */
'use client'

import { useEffect, useRef } from 'react'
import { syncSessionRole } from '@/app/actions/profile'

export default function ApprovalWatcher() {
  const navigating = useRef(false)

  useEffect(() => {
    let active = true

    const route = (role: string | null) => {
      if (navigating.current) return

      let dest: string | null = null
      if (role === 'MEMBER') dest = '/agenda'
      else if (role === 'ADMIN') dest = '/admin/calendar'
      else if (role === 'INCOMPLETE') dest = '/complete-profile'
      else if (!role || role === 'DELETED' || role === 'DENIED') dest = '/login'
      // role === 'PENDING' → keep waiting on this page.

      if (dest) {
        navigating.current = true
        // Full navigation so the browser sends the refreshed cookie and the
        // middleware re-evaluates against the new role.
        window.location.assign(dest)
      }
    }

    const check = async () => {
      try {
        const { role } = await syncSessionRole()
        if (active) route(role)
      } catch {
        // Transient failure — retry on the next interval tick.
      }
    }

    check()
    const id = setInterval(check, 5000)

    return () => {
      active = false
      clearInterval(id)
    }
  }, [])

  return null
}
