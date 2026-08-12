/**
 * Agenda Execution Pipeline
 *
 * The "big red button" of AgendaMaster — orchestrates Google Sheet creation,
 * Gmail dispatch, and database state synchronization for Step 4 of the wizard.
 *
 * Two execution modes:
 *   1. First run:  Creates a Google Sheet, sends email to all members+subscribers,
 *                  and stores the sheet ID/URL in the meeting record.
 *   2. Re-run:     Updates the existing Google Sheet with new role data
 *                  (no email re-send).
 *
 * Requires the user's Google OAuth access token with drive.file + gmail.send
 * scopes — except for ADMIN callers, who have no Google identity (credentials
 * login) and instead update existing sheets via the app's service account.
 */
'use server'

import { auth } from '@/auth'
import { db } from '@/lib/db'
import { createAgendaSheet, updateAgendaSheet, sendGmailAsUser, getServiceAccountEmail } from '@/lib/google-api'
import { getDisplayName, type NameableUser } from '@/lib/user-logic'
import { BACKUP_SPEAKER } from '@/lib/agenda-logic'
import { revalidatePath } from 'next/cache'

/**
 * Builds the complete CSV role label → display name map.
 * This maps EVERY role label that appears in col[1] of the CSV template
 * to the person who should fill that slot.
 */
function buildRoleMap(
  roleAssignments: { roleName: string; user: NameableUser | null }[],
  allMembers: NameableUser[],
  meeting: { isGuestEducationSession: boolean; guestSpeakerName: string | null }
): Record<string, string> {
  const map: Record<string, string> = {};

  // 1. Fixed roles (hardcoded people per spec)
  map['Roles For Next Meeting'] = 'John';
  map['Business Meeting'] = 'Andrew';
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

/**
 * Full execution pipeline for Step 4 of the Agenda Wizard.
 * 
 * First execution:  Create Google Sheet + Send email + Store sheet ID
 * Re-execution:     Update existing Google Sheet (silently, no email re-send)
 */
export async function executeAgendaPipeline(
  meetingId: string,
  emailSubject: string,
  emailHtmlBody: string,
  meetingTheme: string,
  qotd: string,
  // '' = the caller never resolved Step 2 (update mode before rehydration
  // finished) — keep the stored choice, same contract as theme/qotd.
  meetingType: string = ''
): Promise<{
  success: boolean;
  sheetUrl?: string;
  error?: string;
  isUpdate?: boolean;
  // 'NO_SHEET' marks the one refusal that is benign in update mode: an admin
  // touched a meeting that was never finalized, so there is nothing to sync.
  code?: 'NO_SHEET';
}> {
  const session = await auth();

  if (!session?.user) {
    return { success: false, error: 'Not signed in.' };
  }

  // Two Google auth paths, chosen by what the caller HAS, not who they are:
  // a caller with a Google OAuth token (the Toastmaster) uses it exactly as
  // before; an ADMIN has no token by construction — the Credentials provider
  // never touches Google, so session.user.accessToken is structurally
  // undefined for every admin session — and falls through to the app's
  // service account. That fallback can only update an EXISTING sheet (it is
  // never the sender of the agenda email), which is enforced below.
  const accessToken = session.user.accessToken ?? null;
  const usingServiceAccount = !accessToken && session.user.role === 'ADMIN';

  if (!accessToken && !usingServiceAccount) {
    return {
      success: false,
      error: 'Google API permissions not available. Please sign out and sign back in with Google to grant the required permissions.'
    };
  }

  try {
    // Fetch meeting with all assignments
    const meeting = await db.meeting.findUnique({
      where: { id: meetingId },
      include: {
        roleAssignments: { include: { user: true } },
        template: true
      }
    });

    if (!meeting) {
      return { success: false, error: 'Meeting not found.' };
    }

    // All approved accounts. ADMINs are included here because they still receive
    // the agenda email and are needed for display-name disambiguation — but they
    // are NOT club attendees (see unassignedNames below).
    const allMembers = await db.user.findMany({
      where: { role: { in: ['MEMBER', 'ADMIN'] } }
    });

    // Resolve the meeting type the same way theme/qotd are resolved below: an
    // empty string means the caller never saw Step 2, so the stored choice
    // stands. Whatever resolves here is what gets persisted and what gates the
    // guest override for THIS sheet write.
    const effectiveIsGuestEd = meetingType
      ? meetingType === 'Education'
      : meeting.isGuestEducationSession;

    // Build the role map
    const roleMap = buildRoleMap(
      meeting.roleAssignments.map((a: { roleName: string; user: NameableUser | null }) => ({
        roleName: a.roleName,
        user: a.user as NameableUser | null
      })),
      allMembers,
      { isGuestEducationSession: effectiveIsGuestEd, guestSpeakerName: meeting.guestSpeakerName }
    );

    // Drives the "Speaker 3" → "Guest Speaker" column-B label swap in
    // populateTemplate(). Must mirror the buildRoleMap() gating exactly, or the
    // sheet would show a relabeled row with a member's name in it (or vice versa).
    const guestEducationActive = effectiveIsGuestEd && !!meeting.guestSpeakerName?.trim();

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
        .filter((a: { roleName: string }) => a.roleName !== BACKUP_SPEAKER)
        .map((a: { userId: string | null }) => a.userId)
        .filter(Boolean)
    );
    const unassignedNames = allMembers
      .filter((m: { role: string }) => m.role === 'MEMBER')
      .filter((m: { id: string }) => !assignedUserIds.has(m.id))
      .map((m: NameableUser) => getDisplayName(m, allMembers));

    // The theme and QOTD live in Step 2 of the wizard, which update-mode entries
    // and silent re-runs never render — so the caller can legitimately arrive
    // with empty strings. Falling back to the stored values (and only then to a
    // placeholder) is what stops a quick roster edit from wiping the question
    // already printed on the sheet. Whatever we resolve here is also what gets
    // persisted below, so the next run starts from a filled-in value.
    const effectiveTheme = meetingTheme.trim() || meeting.theme?.trim() || 'Meeting';
    const effectiveQotd = qotd.trim() || meeting.qotd?.trim() || 'TBD';

    let csvTemplate = meeting.template.schemaStructure;

    // HEALING FALLBACK: Early meetings may reference a corrupted '{}' template
    // that was created before the CSV seeder was implemented. Fall back to
    // the canonical Regular template if detected.
    if (csvTemplate && csvTemplate.trim() === '{}') {
      const fallbackTemplate = await db.meetingTemplate.findFirst({
        where: { type: 'Regular' }
      });
      if (fallbackTemplate) {
        csvTemplate = fallbackTemplate.schemaStructure;
      }
    }

    // --- Check if this is a first-time creation or an update ---
    const isUpdate = !!meeting.googleSheetId;

    let sheetUrl: string;

    if (isUpdate) {
      // SILENT UPDATE: just re-populate the existing sheet
      await updateAgendaSheet(
        accessToken,
        meeting.googleSheetId!,
        effectiveTheme,
        effectiveQotd,
        roleMap,
        csvTemplate,
        unassignedNames,
        guestEducationActive
      );
      sheetUrl = meeting.googleSheetUrl!;
    } else {
      // First-time creation also sends the agenda email as the Toastmaster —
      // a Google identity the service account cannot and must not stand in
      // for. An admin landing here (meeting never finalized) gets a clear
      // refusal instead of a half-executed pipeline.
      if (!accessToken) {
        return {
          success: false,
          code: 'NO_SHEET',
          error: 'This meeting has no agenda sheet yet. The sheet is created (and the agenda email sent) by the assigned Toastmaster signing in with Google — admin editing only works on a meeting that has already been finalized.'
        };
      }

      // FIRST TIME: create the sheet + send email
      const result = await createAgendaSheet(
        accessToken,
        meeting.date,
        effectiveTheme,
        effectiveQotd,
        roleMap,
        csvTemplate,
        unassignedNames,
        guestEducationActive
      );
      sheetUrl = result.sheetUrl;

      // Store sheet IDs in the meeting record
      await db.meeting.update({
        where: { id: meetingId },
        data: {
          googleSheetId: result.sheetId,
          googleSheetUrl: result.sheetUrl,
          theme: effectiveTheme,
          qotd: effectiveQotd,
          isGuestEducationSession: effectiveIsGuestEd
        }
      });

      // Build the email with the sheet link appended
      const emailWithLink = `
        ${emailHtmlBody}
        <div style="margin-top: 24px; padding: 16px; background: #f0f4f8; border-radius: 8px; border-left: 4px solid #004165;">
          <p style="margin: 0; font-size: 14px; color: #333;">
            <strong>📋 Agenda Sheet:</strong><br/>
            <a href="${sheetUrl}" style="color: #004165; font-weight: bold;">${sheetUrl}</a>
          </p>
        </div>
        <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;" />
        <p style="font-size: 11px; color: #999;">
          Sent via DTCGC AgendaMaster — Downtown Coquitlam Gavel Club
        </p>
      `;

      // Collect all recipients
      const memberEmails = allMembers.map((m: { email: string }) => m.email);
      const subscribers = await db.subscriber.findMany({ select: { email: true } });
      const subscriberEmails = subscribers.map((s: { email: string }) => s.email);
      const allRecipients = Array.from(new Set([...memberEmails, ...subscriberEmails]));

      // Send via Gmail API (as the logged-in Toastmaster)
      await sendGmailAsUser(accessToken, allRecipients, emailSubject, emailWithLink);
    }

    // On the create path these were persisted alongside the sheet IDs above.
    if (isUpdate) {
      await db.meeting.update({
        where: { id: meetingId },
        data: { theme: effectiveTheme, qotd: effectiveQotd, isGuestEducationSession: effectiveIsGuestEd }
      });
    }

    revalidatePath('/agenda');
    revalidatePath('/admin/calendar');

    return { success: true, sheetUrl, isUpdate };
  } catch (error: unknown) {
    console.error('Agenda execution pipeline error:', error);

    // KNOWN LIMITATION, surfaced on purpose: sheets created before the
    // service-account grant existed were never shared with the service
    // account, so Google rejects the admin's update with a 403/404. That is
    // fixed by a one-time manual share of that sheet — say so, instead of
    // leaking a bare "The caller does not have permission".
    if (usingServiceAccount && isGooglePermissionError(error)) {
      const saEmail = getServiceAccountEmail();
      return {
        success: false,
        error: `Google denied the app's service account access to this meeting's sheet. Sheets created before admin editing shipped were never shared with it automatically — open the sheet in Google Sheets, hit Share, and add ${saEmail ?? 'the service account email'} as an Editor, then try again.`
      };
    }

    const message = error instanceof Error ? error.message : 'An unexpected error occurred during the execution pipeline.'
    return {
      success: false,
      error: message
    };
  }
}

/**
 * True when a googleapis error means "you can't see/touch this file".
 * Drive/Sheets answer 403 for a known-but-forbidden file and 404 for a file
 * the caller can't even see — for an unshared sheet, either can appear.
 */
function isGooglePermissionError(error: unknown): boolean {
  const e = error as { code?: number | string; status?: number; response?: { status?: number } };
  const status = Number(e?.code ?? e?.status ?? e?.response?.status);
  return status === 403 || status === 404;
}
