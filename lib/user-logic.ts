/**
 * Logic:
 * 1. Displays First Name by default.
 * 2. Automatically appends Last Initial (e.g., "John S.") if another active member shares the same first name.
 * 3. Admins view full names in Admin management views (handled in page components).
 */

export type NameableUser = {
    firstName: string;
    lastName: string;
}

export function getDisplayName(user: NameableUser, roster: NameableUser[]): string {
    if (!user) return "TBD";
    
    const sameFirstNameCount = roster.filter(u => u.firstName === user.firstName).length;
    
    if (sameFirstNameCount > 1) {
        return `${user.firstName} ${user.lastName.charAt(0).toUpperCase()}.`;
    }
    
    return user.firstName;
}
