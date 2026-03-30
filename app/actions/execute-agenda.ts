'use server'

import { auth } from '@/auth'
import { db } from '@/lib/db'
import { createAgendaSheet, sendGmailAsUser } from '@/lib/google-api'
import { getDisplayName } from '@/lib/user-logic'
import { MINOR_ROLES, MAJOR_ROLES, FIXED_ROLES } from '@/lib/agenda-logic'
import { revalidatePath } from 'next/cache'

/**
 * Full execution pipeline for Step 4 of the Agenda Wizard:
 * 1. Create a Google Sheet from the template, populated with role assignments
 * 2. Send the email to all members/subscribers with the sheet link
 * 3. Mark the meeting as COMPLETED
 */
export async function executeAgendaPipeline(
  meetingId: string,
  emailSubject: string,
  emailHtmlBody: string,
  meetingTheme: string
): Promise<{ success: boolean; sheetUrl?: string; error?: string }> {
  const session = await auth();

  if (!session?.user?.accessToken) {
    return {
      success: false,
      error: 'Google API permissions not available. Please sign out and sign back in with Google to grant the required permissions.'
    };
  }

  const accessToken = session.user.accessToken;

  try {
    // --- 1. Fetch meeting data and build role map ---
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

    // Build the complete role → display name mapping
    const allMembers = await db.user.findMany({
      where: { role: { in: ['MEMBER', 'ADMIN'] } }
    });

    const roleMap: Record<string, string> = {};

    // Fixed roles
    for (const [role, name] of Object.entries(FIXED_ROLES)) {
      roleMap[role] = name;
    }

    // Major + Minor roles from DB assignments
    for (const assignment of meeting.roleAssignments) {
      if (assignment.user) {
        roleMap[assignment.roleName] = getDisplayName(assignment.user, allMembers);
      }
    }

    // Also map "Speaker #1" → "Speaker 1" etc for CSV template compatibility
    const csvAliases: Record<string, string> = {
      'Speaker #1': roleMap['Speaker 1'] || 'TBD',
      'Speaker #2': roleMap['Speaker 2'] || 'TBD',
      'Speaker 3': roleMap['Speaker 3'] || 'TBD',
      'Evaluator #1': roleMap['Evaluator 1'] || 'TBD',
      'Evaluator #2': roleMap['Evaluator 2'] || 'TBD',
      'Evaluator #3': roleMap['Evaluator 3'] || 'TBD',
      'Table Topics Evaluator #1': roleMap['Table Topics Evaluator 1'] || 'TBD',
      'Table Topics Evaluator #2': roleMap['Table Topics Evaluator 2'] || 'TBD',
    };

    const fullRoleMap = { ...roleMap, ...csvAliases };

    // --- 2. Create the Google Sheet ---
    const csvTemplate = meeting.template.schemaStructure;
    const { sheetUrl } = await createAgendaSheet(
      accessToken,
      meeting.date,
      meetingTheme,
      fullRoleMap,
      csvTemplate
    );

    // --- 3. Build the email with the sheet link appended ---
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

    // --- 4. Collect all recipients ---
    const memberEmails = allMembers.map((m: { email: string }) => m.email);
    const subscribers = await db.subscriber.findMany({ select: { email: true } });
    const subscriberEmails = subscribers.map((s: { email: string }) => s.email);
    const allRecipients = Array.from(new Set([...memberEmails, ...subscriberEmails]));

    // --- 5. Send via Gmail API (as the logged-in Toastmaster) ---
    await sendGmailAsUser(
      accessToken,
      allRecipients,
      emailSubject,
      emailWithLink
    );

    // --- 6. Update meeting state ---
    await db.meeting.update({
      where: { id: meetingId },
      data: { 
        theme: meetingTheme,
        status: 'COMPLETED' 
      }
    });

    revalidatePath('/agenda');
    revalidatePath('/admin/calendar');

    return { success: true, sheetUrl };
  } catch (error: any) {
    console.error('Agenda execution pipeline error:', error);
    return {
      success: false,
      error: error.message || 'An unexpected error occurred during the execution pipeline.'
    };
  }
}
