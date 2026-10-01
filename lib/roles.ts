/**
 * Role Definitions
 *
 * The club's role names, in one dependency-free module so client components
 * (the wizard, the Role Management form) can import them without pulling in
 * the database layer that lib/agenda-logic.ts needs.
 */

/** Roles automatically assigned by the heuristic engine (round-robin by recency). */
export const MINOR_ROLES = [
  "Sergeant at Arms",
  "Timer",
  "Grammarian",
  "Filler Word Counter",
  "Evaluator 1",
  "Evaluator 2",
  "Evaluator 3",
  "Table Topics Evaluator 1",
  "Table Topics Evaluator 2"
];

/** Roles manually assigned by admins via the Role Management panel. */
export const MAJOR_ROLES = [
  "Toastmaster",
  "Speaker 1",
  "Speaker 2",
  "Speaker 3",
  "Table Topics Master",
  "Quizmaster"
];

/**
 * The standby speaker slot.
 *
 * Deliberately absent from both MAJOR_ROLES and MINOR_ROLES, because it is a
 * *title*, not a job: the backup speaker only ever speaks if one of the three
 * booked speakers drops out. If all three show up, they do not perform at all
 * and are instead given a real speaking slot at a later meeting.
 *
 * Everything downstream must therefore treat the holder as roleless — they stay
 * eligible for a minor role, stay on the attendance list, and (critically) are
 * NOT counted as recently active. Counting it would let a member sit backup
 * twice and be pushed to the back of the priority queue without ever having
 * spoken.
 */
export const BACKUP_SPEAKER = 'Backup Speaker';

/**
 * Rows permanently held by specific people per club standing rules. They are
 * labels, not assignments: never stored in the database, never counted as
 * anyone's role. Keys match the agenda template's labels exactly.
 */
export const FIXED_ROLES: Record<string, string> = {
  "Roles For Next Meeting": "John",
  "Business Meeting": "Andrew",
};

/** Every role row in meeting order — the dashboard roster and the wizard's copy fallback. */
export const ROSTER_ORDER = [
  "Sergeant at Arms", "Toastmaster", "Timer", "Grammarian", "Filler Word Counter", "Quizmaster",
  "Speaker 1", "Speaker 2", "Speaker 3", "Evaluator 1", "Evaluator 2", "Evaluator 3",
  "Roles For Next Meeting", "Business Meeting", "Table Topics Master", "Table Topics Evaluator 1", "Table Topics Evaluator 2"
];
