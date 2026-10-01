/**
 * Meeting Edit Authorization
 *
 * Who may change a meeting's roster or run its agenda pipeline. Kept apart
 * from lib/auth-guard.ts (which needs a request context to read the session)
 * so the rule itself can be tested against a scratch database.
 *
 * The /agenda/create page already hides the wizard from everyone else, but
 * server actions are public POST endpoints: without this check any signed-in
 * account could rewrite any meeting's roster, or create the agenda sheet and
 * email the whole club.
 */
import { db } from './db'
import { editableMeetingsSince } from './archival'

export const NOT_A_MEMBER = 'Unauthorized: club membership required.'
export const MEETING_LOCKED = 'This meeting is no longer open for editing.'
export const NOT_THE_TOASTMASTER = "Only this meeting's Toastmaster (or an executive) can edit its agenda."

/**
 * @returns null when `caller` may edit the meeting, otherwise a user-facing reason.
 *
 * Allowed: an ADMIN, or the MEMBER who holds the meeting's Toastmaster role —
 * and only while the meeting is SCHEDULED and still inside its edit window.
 */
export async function meetingEditDenial(
  caller: { role?: string; dbId?: string } | undefined,
  meetingId: string
): Promise<string | null> {
  const role = caller?.role
  if (role !== 'MEMBER' && role !== 'ADMIN') return NOT_A_MEMBER

  const meeting = await db.meeting.findUnique({
    where: { id: meetingId },
    select: {
      status: true,
      date: true,
      roleAssignments: { where: { roleName: 'Toastmaster' }, select: { userId: true } },
    },
  })
  if (!meeting) return 'Meeting not found.'
  if (meeting.status !== 'SCHEDULED' || meeting.date < editableMeetingsSince()) return MEETING_LOCKED

  if (role === 'ADMIN') return null
  const toastmasterId = meeting.roleAssignments[0]?.userId
  return toastmasterId && toastmasterId === caller?.dbId ? null : NOT_THE_TOASTMASTER
}
