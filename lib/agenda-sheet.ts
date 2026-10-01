/**
 * Agenda Sheet Payload Builder
 *
 * Turns a meeting's database state into the arguments createAgendaSheet() /
 * updateAgendaSheet() expect. Shared by the Step 4 pipeline
 * (app/actions/execute-agenda.ts) and the pre-meeting refresh
 * (refreshTodaysSheets below), so both always render the sheet identically.
 */
import { db } from '@/lib/db'
import { getDisplayName, type NameableUser } from '@/lib/user-logic'
import { BACKUP_SPEAKER, FIXED_ROLES } from '@/lib/roles'
import { updateAgendaSheet } from '@/lib/google-api'

/**
 * Builds the complete CSV role label → display name map.
 * This maps EVERY role label that appears in col[1] of the CSV template
 * to the person who should fill that slot.
 */
export function buildRoleMap(
  roleAssignments: { roleName: string; user: NameableUser | null }[],
  allMembers: NameableUser[],
  meeting: { isGuestEducationSession: boolean; guestSpeakerName: string | null }
): Record<string, string> {
  const map: Record<string, string> = {};

  // 1. Fixed roles (held by the same people every meeting — lib/roles.ts)
  Object.assign(map, FIXED_ROLES);
  // Dismissal is permanently Franklin's — it no longer follows the Sergeant at
  // Arms. Listed here as well as in the CSV so computeChangelog() diffs it
  // against a matching entry and never reports it as a swap.
  map['Dismissal'] = 'Franklin';

  // 2. DB assignments (major + minor roles assigned in the app)
  for (const a of roleAssignments) {
    if (a.user) {
      const name = getDisplayName(a.user, allMembers);
      map[a.roleName] = name;
    }
  }

  // 3. CSV alias mappings — the CSV uses "#" notation and has some quirky labels
  // Map them to the internal role names we already have
  const alias = (csvLabel: string, internalRole: string) => {
    if (!map[csvLabel] && map[internalRole]) {
      map[csvLabel] = map[internalRole];
    }
  };

  alias('Speaker #1', 'Speaker 1');
  alias('Speaker #2', 'Speaker 2');
  // "Speaker 3" in CSV matches internal name directly — no alias needed
  alias('Evaluator #1', 'Evaluator 1');
  alias('Evaluator #2', 'Evaluator 2');
  alias('Evaluator #3', 'Evaluator 3');
  alias('Table Topics Evaluator #1', 'Table Topics Evaluator 1');
  alias('Table Topics Evaluator #2', 'Table Topics Evaluator 2');

  // General Feedback rows are now intentionally left un-aliased so they can be parsed as '-' by the Google API logic.

  // Recurring roles in the second half of the meeting
  // Timer, Grammarian, FWC, Quizmaster, Toastmaster appear twice — same person
  // They already match by exact name from DB assignments

  // Derived roles (same person as another role)
  alias('Comments and Closing Remarks', 'Toastmaster');

  // The CSV label carries a colon (row reads "BACKUP SPEAKER: "). Left unmapped
  // it renders as 'TBD', which is the correct output for an empty standby slot.
  alias('BACKUP SPEAKER:', BACKUP_SPEAKER);

  // Break Time is unstaffed by design. An empty string is the marker for that:
  // populateTemplate() renders it as '-' rather than 'TBD'.
  map['Break Time'] = '';

  // 4. Guest Education override — derived here at read time, ON PURPOSE, rather
  // than gated at write time: guestSpeakerName may sit inert in the DB for any
  // meeting. It only reaches the sheet when BOTH the admin entered a name AND
  // the Toastmaster marked the meeting a Guest Education Session. With only one
  // condition true, Speaker 3 falls through to the normal assignment above (or
  // TBD) — and when both hold, the guest wins even over an assigned member.
  const guestName = meeting.guestSpeakerName?.trim();
  if (meeting.isGuestEducationSession && guestName) {
    map['Speaker 3'] = guestName;
    // Also under the label the sheet will actually display after the swap in
    // populateTemplate(). computeChangelog() diffs the sheet's labels against
    // this map, and without this entry every re-run of an active session would
    // log a phantom "[<guest>: Guest Speaker ---> Speaker 3]" swap.
    map['Guest Speaker'] = guestName;
  }

  return map;
}

/** Everything updateAgendaSheet()/createAgendaSheet() need beyond the sheet itself. */
export interface SheetPayload {
  meeting: NonNullable<Awaited<ReturnType<typeof loadMeeting>>>
  allMembers: Awaited<ReturnType<typeof loadMembers>>
  roleMap: Record<string, string>
  unassignedNames: string[]
  effectiveTheme: string
  effectiveQotd: string
  effectiveIsGuestEd: boolean
  guestEducationActive: boolean
  csvTemplate: string
}

function loadMembers() {
  return db.user.findMany({ where: { role: { in: ['MEMBER', 'ADMIN'] } } })
}

function loadMeeting(meetingId: string) {
  return db.meeting.findUnique({
    where: { id: meetingId },
    include: {
      roleAssignments: { include: { user: true } },
      template: true
    }
  })
}

/**
 * Resolves a meeting's sheet arguments from the database.
 *
 * `theme` / `qotd` / `meetingType` are the caller's Step 2 values; an empty
 * string means "the caller never saw Step 2" and the stored value stands
 * (the pre-meeting refresh always passes empty strings for this reason).
 * Returns null when the meeting does not exist.
 */
export async function buildSheetPayload(
  meetingId: string,
  theme: string = '',
  qotd: string = '',
  meetingType: string = ''
): Promise<SheetPayload | null> {
  const meeting = await loadMeeting(meetingId)
  if (!meeting) return null

  // All approved accounts. ADMINs are included here because they still receive
  // the agenda email and are needed for display-name disambiguation — but they
  // are NOT club attendees (see unassignedNames below).
  const allMembers = await loadMembers()

  // Resolve the meeting type the same way theme/qotd are resolved below: an
  // empty string means the caller never saw Step 2, so the stored choice
  // stands. Whatever resolves here is what gets persisted and what gates the
  // guest override for THIS sheet write.
  const effectiveIsGuestEd = meetingType
    ? meetingType === 'Education'
    : meeting.isGuestEducationSession

  const roleMap = buildRoleMap(
    meeting.roleAssignments,
    allMembers,
    { isGuestEducationSession: effectiveIsGuestEd, guestSpeakerName: meeting.guestSpeakerName }
  )

  // Drives the "Speaker 3" → "Guest Speaker" column-B label swap in
  // populateTemplate(). Must mirror the buildRoleMap() gating exactly, or the
  // sheet would show a relabeled row with a member's name in it (or vice versa).
  const guestEducationActive = effectiveIsGuestEd && !!meeting.guestSpeakerName?.trim()

  // Compute the "No Roles" list: members attending without a formal role.
  // ADMIN accounts are excluded — the club's shared admin credential is not a
  // person, and an ADMIN can never hold a role anyway (both the auto-assignment
  // engine and the admin Role Management panel only ever offer MEMBER users).
  // This mirrors the wizard's Attendance List, which is MEMBER-only.
  //
  // The Backup Speaker is excluded from the "has a role" test on purpose: the
  // title carries no duties, so the holder is still an attendee without a role
  // and belongs in this list. They appear twice on the sheet — once on the
  // BACKUP SPEAKER line, once here — which is the accurate description.
  const assignedUserIds = new Set(
    meeting.roleAssignments
      .filter((a) => a.roleName !== BACKUP_SPEAKER)
      .map((a) => a.userId)
      .filter(Boolean)
  )
  const unassignedNames = allMembers
    .filter((m) => m.role === 'MEMBER')
    .filter((m) => !assignedUserIds.has(m.id))
    .map((m) => getDisplayName(m, allMembers))

  // The theme and QOTD live in Step 2 of the wizard, which update-mode entries
  // and silent re-runs never render — so the caller can legitimately arrive
  // with empty strings. Falling back to the stored values (and only then to a
  // placeholder) is what stops a quick roster edit from wiping the question
  // already printed on the sheet. Whatever we resolve here is also what gets
  // persisted, so the next run starts from a filled-in value.
  const effectiveTheme = theme.trim() || meeting.theme?.trim() || 'Meeting'
  const effectiveQotd = qotd.trim() || meeting.qotd?.trim() || 'TBD'

  let csvTemplate = meeting.template.schemaStructure

  // HEALING FALLBACK: Early meetings may reference a corrupted '{}' template
  // that was created before the CSV seeder was implemented. Fall back to
  // the canonical Regular template if detected.
  if (csvTemplate && csvTemplate.trim() === '{}') {
    const fallbackTemplate = await db.meetingTemplate.findFirst({
      where: { type: 'Regular' }
    })
    if (fallbackTemplate) {
      csvTemplate = fallbackTemplate.schemaStructure
    }
  }

  return {
    meeting,
    allMembers,
    roleMap,
    unassignedNames,
    effectiveTheme,
    effectiveQotd,
    effectiveIsGuestEd,
    guestEducationActive,
    csvTemplate
  }
}

export interface RefreshResult {
  meetingId: string
  ok: boolean
  error?: string
}

/**
 * Pre-meeting refresh: rewrites the agenda sheet of every meeting happening
 * today from the database, as the service account.
 *
 * Purpose: the DB is the source of truth and the Toastmaster owns (can edit)
 * their sheet, so an accidental keystroke there would otherwise be shown to
 * the whole club. Rewriting shortly before the meeting starts reverts it.
 * It deliberately does NOT read anything back from the sheet or touch the DB.
 *
 * Only meetings that already have a sheet are touched — the refresh can never
 * create a sheet or send an email (that needs the Toastmaster's Google login).
 * One meeting failing never stops the others.
 */
export async function refreshTodaysSheets(): Promise<RefreshResult[]> {
  // Meetings are stored at 6:45 PM Pacific and the server runs on Pacific time,
  // so "today" in server-local time is the meeting day.
  const startOfDay = new Date()
  startOfDay.setHours(0, 0, 0, 0)
  const endOfDay = new Date(startOfDay)
  endOfDay.setDate(endOfDay.getDate() + 1)

  const meetings = await db.meeting.findMany({
    where: {
      status: 'SCHEDULED',
      googleSheetId: { not: null },
      date: { gte: startOfDay, lt: endOfDay }
    },
    select: { id: true }
  })

  const results: RefreshResult[] = []
  for (const { id } of meetings) {
    try {
      const payload = await buildSheetPayload(id)
      if (!payload?.meeting.googleSheetId) {
        results.push({ meetingId: id, ok: false, error: 'Meeting or sheet ID missing.' })
        continue
      }
      await updateAgendaSheet(
        null, // service account — no Toastmaster token available on a cron
        payload.meeting.googleSheetId,
        payload.effectiveTheme,
        payload.effectiveQotd,
        payload.roleMap,
        payload.csvTemplate,
        payload.unassignedNames,
        payload.guestEducationActive
      )
      results.push({ meetingId: id, ok: true })
    } catch (error: unknown) {
      console.error(`[Refresh] Failed to refresh sheet for meeting ${id}:`, error)
      results.push({
        meetingId: id,
        ok: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      })
    }
  }
  return results
}
