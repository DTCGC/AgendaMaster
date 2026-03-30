'use server'

import { getAutoAssignments, cleanDraftText } from '@/lib/agenda-logic'

export async function fetchRoleAssignments(meetingId: string) {
    // Generates the deterministic heuristic role set based on historical DB entries
    const assignmentsData = await getAutoAssignments(meetingId);
    return assignmentsData;
}

export async function formatDraft(text: string) {
    // Pass raw HTML through our text formatter
    return cleanDraftText(text);
}
