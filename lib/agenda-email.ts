/**
 * When the agenda email goes out: once per meeting.
 *
 * The first Step 4 run creates the sheet and sends the email. Every later run
 * only updates the sheet — except while `agendaEmailPending` is set, which
 * means an earlier run created the sheet but the send failed. A successful
 * send clears the flag, so the email can never go out twice.
 */

type MeetingEmailState = { googleSheetId: string | null; agendaEmailPending: boolean }

/** Whether a pipeline run in `mode` must send the agenda email. 'update' never does. */
export function agendaEmailDue(mode: 'create' | 'update', meeting: MeetingEmailState): boolean {
  return mode === 'create' && (!meeting.googleSheetId || meeting.agendaEmailPending)
}

/**
 * Whether the Toastmaster's dashboard should open the full wizard (whose Step 4
 * sends the email) rather than roster-only update mode, which never sends.
 */
export function needsFullWizard(meeting: MeetingEmailState): boolean {
  return agendaEmailDue('create', meeting)
}
