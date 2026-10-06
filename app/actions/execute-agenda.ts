/**
 * Agenda Execution Pipeline
 *
 * The "big red button" of AgendaMaster — orchestrates Google Sheet creation,
 * Gmail dispatch, and database state synchronization for the wizard.
 *
 * Two modes, chosen by the caller and enforced here:
 *   1. 'create' (Step 4): creates the Google Sheet, emails it to all
 *      members + subscribers, and stores the sheet ID/URL on the meeting. On a
 *      meeting that already has a sheet it updates the sheet instead, and only
 *      sends the email if an earlier run created the sheet but failed to send.
 *   2. 'update' (update mode's Save & Close): updates an existing sheet only.
 *      It never creates a sheet or sends an email.
 *
 * Requires the user's Google OAuth access token with drive.file + gmail.send
 * scopes — except for callers who signed in with a password:
 *   - ADMINs update existing sheets via the app's service account;
 *   - members without Google update via the service account too, and create
 *     the sheet + send the email through the club's connected Google account
 *     (lib/club-google.ts).
 */
'use server'

import { auth } from '@/auth'
import { db } from '@/lib/db'
import { createAgendaSheet, updateAgendaSheet, sendGmailAsUser, getServiceAccountEmail } from '@/lib/google-api'
import { getClubAccessToken, ClubGoogleUnavailableError, CLUB_GOOGLE_EMAIL } from '@/lib/club-google'
import { resolveGoogleAuthPath } from '@/lib/google-auth-path'
import { getGoogleAccessToken } from '@/lib/google-user-token'
import { buildSheetPayload } from '@/lib/agenda-sheet'
import { meetingEditDenial } from '@/lib/meeting-access'
import { revalidateMeetingViews } from '@/lib/revalidate'
import { fail, type ActionResult } from '@/lib/action-result'
import { agendaEmailDue } from '@/lib/agenda-email'

export type PipelineResult = ActionResult<{
  sheetUrl: string;
  isUpdate: boolean;
  /** This run sent the agenda email (on a retry, isUpdate is true too). */
  emailSent: boolean;
  /** Something the caller must read even though the run succeeded. */
  warning?: string;
}>

export interface PipelineInput {
  emailSubject: string;
  emailHtmlBody: string;
  meetingTheme: string;
  qotd: string;
  // '' = the caller never resolved Step 2 (update mode before rehydration
  // finished) — keep the stored choice, same contract as theme/qotd.
  meetingType: string;
}

/**
 * Runs the pipeline for one meeting. Only the meeting's Toastmaster or an
 * admin may call it (lib/meeting-access.ts).
 *
 * A failure with code 'NO_SHEET' is the one refusal that is benign in update
 * mode: the meeting was never finalized, so there is nothing to sync.
 */
export async function executeAgendaPipeline(
  meetingId: string,
  mode: 'create' | 'update',
  input: PipelineInput
): Promise<PipelineResult> {
  const session = await auth();
  const denial = await meetingEditDenial(session?.user, meetingId);
  if (denial || !session?.user) return fail(denial ?? 'Not signed in.');

  // Which Google credential this caller runs under (lib/google-auth-path.ts):
  //   - a Toastmaster who signed in with Google uses their own token;
  //   - an ADMIN always uses the app's service account, which can only update
  //     an EXISTING sheet (it never sends the agenda email — enforced below);
  //   - a member who registered with email + password also updates through the
  //     service account, and creates the sheet + sends the email through the
  //     club's connected Google account.
  const authPath = resolveGoogleAuthPath({
    role: session.user.role,
    authMethod: session.user.authMethod,
    accessToken: session.user.authMethod === 'google' && session.user.role !== 'ADMIN'
      ? await getGoogleAccessToken()
      : null,
  });

  if (authPath.kind === 'none') {
    return fail('Your Google sign-in has expired or is missing permissions. Please sign out, sign back in with Google, and try again.');
  }

  const usingServiceAccount = authPath.kind === 'service-account';
  const accessToken = authPath.kind === 'user-token' ? authPath.accessToken : null;
  const isClubCreate = authPath.kind === 'service-account' && authPath.clubCreate;

  // Set once the service account is about to write to an existing sheet, so a
  // 403/404 is only blamed on a missing share when it really came from there.
  let serviceAccountUpdate = false;

  // The token that creates the sheet and sends the email — the Toastmaster's
  // own, or the club account's for a member without Google. The service
  // account cannot and must not stand in for either.
  // Throws ClubGoogleUnavailableError, whose message is user-facing.
  const creatorToken = async (): Promise<string> => accessToken ?? getClubAccessToken();

  try {
    // Everything the sheet needs, resolved from the DB (shared with the
    // pre-meeting refresh — see lib/agenda-sheet.ts for the reasoning behind
    // each derived value).
    const payload = await buildSheetPayload(meetingId, input.meetingTheme, input.qotd, input.meetingType);
    if (!payload) {
      return fail('Meeting not found.');
    }
    const {
      meeting, allMembers, roleMap, unassignedNames,
      effectiveTheme, effectiveQotd, effectiveIsGuestEd, guestEducationActive, csvTemplate
    } = payload;

    const isUpdate = !!meeting.googleSheetId;
    const mustSendEmail = agendaEmailDue(mode, meeting);

    if (!isUpdate && mode === 'update') {
      return fail(
        'This meeting has no agenda sheet yet. The sheet is created (and the agenda email sent) when the Toastmaster finishes Step 4 of the wizard.',
        'NO_SHEET'
      );
    }
    if (mustSendEmail && !accessToken && !isClubCreate) {
      // An admin on the create path: refuse rather than half-run it.
      return fail(
        'The agenda sheet is created (and the agenda email sent) by the assigned Toastmaster — admin editing only works on a meeting that has already been finalized.',
        'NO_SHEET'
      );
    }
    if (mustSendEmail && !input.emailSubject.trim()) {
      return fail('The email has no subject line. Go back to Step 1 and add one.');
    }

    let sheetUrl: string;
    let warning: string | undefined;
    let emailSent = false;

    if (isUpdate) {
      // Re-populate the existing sheet
      serviceAccountUpdate = usingServiceAccount;
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
      serviceAccountUpdate = false;
      sheetUrl = meeting.googleSheetUrl!;
      await db.meeting.update({
        where: { id: meetingId },
        data: { theme: effectiveTheme, qotd: effectiveQotd, isGuestEducationSession: effectiveIsGuestEd }
      });
    } else {
      const result = await createAgendaSheet(
        await creatorToken(),
        meeting.date,
        effectiveTheme,
        effectiveQotd,
        roleMap,
        csvTemplate,
        unassignedNames,
        guestEducationActive
      );
      sheetUrl = result.sheetUrl;
      warning = result.shareWarning;

      // Saved before the email goes out, with the email marked pending: if
      // the send fails, the retry finds the sheet and still sends the email.
      await db.meeting.update({
        where: { id: meetingId },
        data: {
          googleSheetId: result.sheetId,
          googleSheetUrl: result.sheetUrl,
          agendaEmailPending: true,
          theme: effectiveTheme,
          qotd: effectiveQotd,
          isGuestEducationSession: effectiveIsGuestEd
        }
      });
    }

    if (mustSendEmail) {
      // Sent through the club account: route replies to the Toastmaster
      // instead of the club inbox.
      let replyTo: string | undefined;
      if (!accessToken && session.user.dbId) {
        const sender = await db.user.findUnique({
          where: { id: session.user.dbId },
          select: { email: true }
        });
        if (sender) replyTo = sender.email;
      }

      // Build the email with the sheet link appended
      const emailWithLink = `
        ${input.emailHtmlBody}
        <div style="margin-top: 24px; padding: 16px; background: #f0f4f8; border-radius: 8px; border-left: 4px solid #004165;">
          <p style="margin: 0; font-size: 14px; color: #333;">
            <strong>📋 Agenda Sheet:</strong><br/>
            <a href="${sheetUrl}" style="color: #004165; font-weight: bold;">${sheetUrl}</a>
          </p>
        </div>
      `;

      const subscribers = await db.subscriber.findMany({ select: { email: true } });
      const allRecipients = Array.from(new Set([
        ...allMembers.map((m) => m.email),
        ...subscribers.map((s) => s.email),
      ]));

      // Send via Gmail API (as the Toastmaster, or the club account for them).
      // The sending account's own address is the visible To, so it keeps a
      // copy and no member's address shows.
      const visibleTo = accessToken ? (session.user.email ?? CLUB_GOOGLE_EMAIL) : CLUB_GOOGLE_EMAIL;
      await sendGmailAsUser(await creatorToken(), allRecipients, input.emailSubject, emailWithLink, { replyTo, visibleTo });
      emailSent = true;
      await db.meeting.update({ where: { id: meetingId }, data: { agendaEmailPending: false } });
    }

    revalidateMeetingViews();

    return { success: true, sheetUrl, isUpdate, emailSent, warning };
  } catch (error: unknown) {
    console.error('Agenda execution pipeline error:', error);
    // The sheet may have been saved before the failure.
    revalidateMeetingViews();

    if (error instanceof ClubGoogleUnavailableError) {
      return fail(error.message);
    }

    // KNOWN LIMITATION, surfaced on purpose: sheets created before the
    // service-account grant existed were never shared with the service
    // account, so Google rejects a service-account update with a 403/404.
    // That is fixed by a one-time manual share of that sheet — say so,
    // instead of leaking a bare "The caller does not have permission".
    if (serviceAccountUpdate && isGooglePermissionError(error)) {
      const saEmail = getServiceAccountEmail();
      return fail(`Google denied the app's service account access to this meeting's sheet. Sheets created before admin editing shipped were never shared with it automatically — open the sheet in Google Sheets, hit Share, and add ${saEmail ?? 'the service account email'} as an Editor, then try again. (An executive may need to do this.)`);
    }

    return fail(error instanceof Error ? error.message : 'An unexpected error occurred during the execution pipeline.');
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
