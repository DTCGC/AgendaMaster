import { NextResponse } from 'next/server'
import { archivePassedMeetings } from '@/lib/archival'

/**
 * API Endpoint for automated meeting archival.
 * Triggered via internal cron, secured by CRON_SECRET.
 */
export async function POST(request: Request) {
  const authHeader = request.headers.get('Authorization')
  const secret = process.env.CRON_SECRET

  if (!secret || authHeader !== `Bearer ${secret}`) {
    return new Response('Unauthorized', { status: 401 })
  }

  try {
    const result = await archivePassedMeetings()
    return NextResponse.json({ 
        success: true, 
        message: `Successfully archived ${result.count} meetings.`,
        count: result.count 
    })
  } catch (error: any) {
    console.error('Archival Error:', error)
    return NextResponse.json({ 
        success: false, 
        error: error.message || 'Internal Server Error' 
    }, { status: 500 })
  }
}
