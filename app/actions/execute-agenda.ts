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
