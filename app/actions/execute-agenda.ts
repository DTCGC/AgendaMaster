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
import { getClubAccessToken, ClubGoogleUnavailableError } from '@/lib/club-google'
import { resolveGoogleAuthPath } from '@/lib/google-auth-path'
import { buildSheetPayload } from '@/lib/agenda-sheet'
import { revalidatePath } from 'next/cache'

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
    accessToken: session.user.accessToken,
  });

  if (authPath.kind === 'none') {
    return {
      success: false,
      error: 'Google API permissions not available. Please sign out and sign back in with Google to grant the required permissions.'
    };
  }

  const usingServiceAccount = authPath.kind === 'service-account';
  const accessToken = authPath.kind === 'user-token' ? authPath.accessToken : null;

  // Set once the service account is about to write to an existing sheet, so a
  // 403/404 is only blamed on a missing share when it really came from there.
  let serviceAccountUpdate = false;

  try {
    // Everything the sheet needs, resolved from the DB (shared with the
    // pre-meeting refresh — see lib/agenda-sheet.ts for the reasoning behind
    // each derived value).
    const payload = await buildSheetPayload(meetingId, meetingTheme, qotd, meetingType);
    if (!payload) {
      return { success: false, error: 'Meeting not found.' };
    }
    const {
      meeting, allMembers, roleMap, unassignedNames,
      effectiveTheme, effectiveQotd, effectiveIsGuestEd, guestEducationActive, csvTemplate
    } = payload;

    // --- Check if this is a first-time creation or an update ---
    const isUpdate = !!meeting.googleSheetId;

    let sheetUrl: string;

    if (isUpdate) {
      // SILENT UPDATE: just re-populate the existing sheet
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
      sheetUrl = meeting.googleSheetUrl!;
    } else {
      // First-time creation also sends the agenda email — as the Toastmaster,
      // or as the club account on behalf of a member without Google. The
      // service account cannot and must not stand in for either. An admin
      // landing here (meeting never finalized) gets a clear refusal instead
      // of a half-executed pipeline.
      const isClubCreate = authPath.kind === 'service-account' && authPath.clubCreate;
      if (!accessToken && !isClubCreate) {
        return {
          success: false,
          code: 'NO_SHEET',
          error: 'This meeting has no agenda sheet yet. The sheet is created (and the agenda email sent) by the assigned Toastmaster — admin editing only works on a meeting that has already been finalized.'
        };
      }

      let creatorToken: string;
      if (accessToken) {
        creatorToken = accessToken;
      } else {
        try {
          creatorToken = await getClubAccessToken();
        } catch (error) {
          if (error instanceof ClubGoogleUnavailableError) {
            return { success: false, error: error.message };
          }
          throw error;
        }
      }

      // FIRST TIME: create the sheet + send email
      const result = await createAgendaSheet(
        creatorToken,
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

      // Sent through the club account: say who it is really from, and route
      // replies to the Toastmaster instead of the club inbox.
      let onBehalfNote = '';
      let replyTo: string | undefined;
      if (!accessToken && session.user.dbId) {
        const sender = await db.user.findUnique({
          where: { id: session.user.dbId },
          select: { firstName: true, lastName: true, email: true }
        });
        if (sender) {
          replyTo = sender.email;
          onBehalfNote = `<p style="font-size: 11px; color: #999;">Sent from the club's account on behalf of ${escapeHtml(`${sender.firstName} ${sender.lastName}`.trim())}, this meeting's Toastmaster. Replies go to them directly.</p>`;
        }
      }

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
        ${onBehalfNote}
      `;

      // Collect all recipients
      const memberEmails = allMembers.map((m: { email: string }) => m.email);
      const subscribers = await db.subscriber.findMany({ select: { email: true } });
      const subscriberEmails = subscribers.map((s: { email: string }) => s.email);
      const allRecipients = Array.from(new Set([...memberEmails, ...subscriberEmails]));

      // Send via Gmail API (as the Toastmaster, or the club account for them)
      await sendGmailAsUser(creatorToken, allRecipients, emailSubject, emailWithLink, { replyTo });
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
    // account, so Google rejects a service-account update with a 403/404.
    // That is fixed by a one-time manual share of that sheet — say so,
    // instead of leaking a bare "The caller does not have permission".
    if (serviceAccountUpdate && isGooglePermissionError(error)) {
      const saEmail = getServiceAccountEmail();
      return {
        success: false,
        error: `Google denied the app's service account access to this meeting's sheet. Sheets created before admin editing shipped were never shared with it automatically — open the sheet in Google Sheets, hit Share, and add ${saEmail ?? 'the service account email'} as an Editor, then try again. (An executive may need to do this.)`
      };
    }

    const message = error instanceof Error ? error.message : 'An unexpected error occurred during the execution pipeline.'
    return {
      success: false,
      error: message
    };
  }
}

/** Minimal HTML escaping for a member-entered name placed in the email body. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
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
