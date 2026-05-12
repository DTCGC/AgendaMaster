/**
 * User Display Name Module
 *
 * Handles privacy-compliant name rendering for club agendas and dashboards.
 *
 * Display rules:
 * 1. Shows first name only by default (e.g., "John").
 * 2. Appends last initial (e.g., "John S.") when another active member
 *    shares the same first name, to avoid ambiguity.
 * 3. Admin views show full names — that logic lives in the page components,
 *    not here.
 */

/** Minimal shape required for display name computation. */
export type NameableUser = {
    firstName: string;
    lastName: string;
}

/**
 * Computes a privacy-friendly display name for a user.
 *
 * @param user   - The member whose name to display.
 * @param roster - The full active member roster, used to detect first-name collisions.
 * @returns A display string like "John" or "John S." (with disambiguating initial).
 */
export function getDisplayName(user: NameableUser, roster: NameableUser[]): string {
    if (!user) return "TBD";
    
    // Count how many roster members share this first name
    const sameFirstNameCount = roster.filter(u => u.firstName === user.firstName).length;
    
    // Disambiguate by appending last initial when collision detected
    if (sameFirstNameCount > 1) {
        return `${user.firstName} ${user.lastName.charAt(0).toUpperCase()}.`;
    }
    
    return user.firstName;
}
