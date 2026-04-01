'use server'

import { auth } from '@/auth'
import { db } from '@/lib/db'
import { createAgendaSheet, updateAgendaSheet } from '@/lib/google-api'
import { getDisplayName, type NameableUser } from '@/lib/user-logic'
import { sendBccEmail } from '@/lib/email'
import { MINOR_ROLES, MAJOR_ROLES, FIXED_ROLES } from '@/lib/agenda-logic'
import { revalidatePath } from 'next/cache'

/**
 * Builds the complete CSV role label → display name map.
 * This maps EVERY role label that appears in col[1] of the CSV template
 * to the person who should fill that slot.
 */
function buildRoleMap(
  roleAssignments: { roleName: string; user: NameableUser | null }[],
  allMembers: NameableUser[]
): Record<string, string> {
  const map: Record<string, string> = {};

  // 1. Fixed roles (hardcoded people per spec)
  map['Roles For Next Meeting'] = 'John';
  map['Business Meeting'] = 'Andrew';

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

  // General Feedback rows — same person as the speaker they follow
  alias('General Feedback #1', 'Speaker 1');    // Speaker #1's feedback slot
  alias('General Feadback #2', 'Speaker 2');    // typo is in the actual CSV
  alias('General Feedback  #3', 'Speaker 3');   // double space is in the actual CSV

  // Recurring roles in the second half of the meeting
  // Timer, Grammarian, FWC, Quizmaster, Toastmaster appear twice — same person
  // They already match by exact name from DB assignments

  // Derived roles (same person as another role)
  alias('Comments and Closing Remarks', 'Toastmaster');
  alias('Dismissal', 'Sergeant at Arms');

  // Break Time has no person
  map['Break Time'] = '';

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
  qotd: string
): Promise<{ success: boolean; sheetUrl?: string; error?: string; isUpdate?: boolean }> {
  const session = await auth();

  if (!session?.user?.accessToken) {
    return {
      success: false,
      error: 'Google API permissions not available. Please sign out and sign back in with Google to grant the required permissions.'
    };
  }

  const accessToken = session.user.accessToken;

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

    // All approved members
    const allMembers = await db.user.findMany({
      where: { role: { in: ['MEMBER', 'ADMIN'] } }
    });

    // Build the role map
    const roleMap = buildRoleMap(
      meeting.roleAssignments.map((a: { roleName: string; user: NameableUser | null }) => ({
        roleName: a.roleName,
        user: a.user as NameableUser | null
      })),
      allMembers
    );

    // Compute unassigned members
    const assignedUserIds = new Set(
      meeting.roleAssignments.map((a: { userId: string | null }) => a.userId).filter(Boolean)
    );
    const unassignedNames = allMembers
      .filter((m: { id: string }) => !assignedUserIds.has(m.id))
      .map((m: NameableUser) => getDisplayName(m, allMembers));

    let csvTemplate = meeting.template.schemaStructure;

    // HEALING FALLBACK: Existing meetings might be bound to the corrupted '{}' standard-toastmasters template.
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
        meetingTheme,
        qotd,
        roleMap,
        csvTemplate,
        unassignedNames
      );
      sheetUrl = meeting.googleSheetUrl!;
    } else {
      // FIRST TIME: create the sheet + send email
      const result = await createAgendaSheet(
        accessToken,
        meeting.date,
        meetingTheme,
        qotd,
        roleMap,
        csvTemplate,
        unassignedNames
      );
      sheetUrl = result.sheetUrl;

      // Store sheet IDs in the meeting record
      await db.meeting.update({
        where: { id: meetingId },
        data: {
          googleSheetId: result.sheetId,
          googleSheetUrl: result.sheetUrl,
          theme: meetingTheme
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

      // Send via unified Resend API bridge
      await sendBccEmail(allRecipients, emailSubject, emailWithLink);
    }

    // Save theme (if not already saved)
    if (!isUpdate) {
      // Already saved above
    } else {
      await db.meeting.update({
        where: { id: meetingId },
        data: { theme: meetingTheme }
      });
    }

    revalidatePath('/agenda');
    revalidatePath('/admin/calendar');

    return { success: true, sheetUrl, isUpdate };
  } catch (error: any) {
    console.error('Agenda execution pipeline error:', error);
    return {
      success: false,
      error: error.message || 'An unexpected error occurred during the execution pipeline.'
    };
  }
}
