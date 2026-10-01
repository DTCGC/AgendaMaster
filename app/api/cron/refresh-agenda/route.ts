/**
 * Cron Pre-Meeting Agenda Refresh Endpoint
 *
 * POST /api/cron/refresh-agenda — called every Friday at 6:30 PM PT by the
 * system crontab on the DigitalOcean Droplet, 15 minutes before the 6:45 PM
 * start. Rewrites today's agenda sheet from the database, reverting any stray
 * manual edit made directly on the sheet. Protected by CRON_SECRET.
 */
import { NextResponse } from 'next/server'
import { hasCronSecret } from '@/lib/request-auth'
import { refreshTodaysSheets } from '@/lib/agenda-sheet'

export async function POST(request: Request) {
  if (!hasCronSecret(request)) {
    return new Response('Unauthorized', { status: 401 })
  }

  try {
    const results = await refreshTodaysSheets()
    const failed = results.filter((r) => !r.ok)
    return NextResponse.json(
      {
        success: failed.length === 0,
        message: `Refreshed ${results.length - failed.length} of ${results.length} sheet(s).`,
        results
      },
      // 500 when anything failed, so `curl --fail` and log monitors notice.
      { status: failed.length === 0 ? 200 : 500 }
    )
  } catch (error: unknown) {
    console.error('Agenda refresh error:', error)
    const message = error instanceof Error ? error.message : 'Internal Server Error'
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
