/**
 * Member name validation, shared by profile completion and the admin name
 * editor so both accept exactly the same names. No server-only imports.
 */

// Letters in any script (so "José" and "Zoë" pass), combining marks, spaces,
// hyphens, apostrophes (straight and curly) and periods ("St. John").
const NAME_PATTERN = /^[\p{L}\p{M}\s\-'’.]+$/u

/** @returns A user-facing error, or null when both names are acceptable. */
export function validatePersonName(firstName: string, lastName: string): string | null {
  if (!firstName.trim() || !lastName.trim()) {
    return 'First name and last name are required.'
  }
  if (!NAME_PATTERN.test(firstName.trim()) || !NAME_PATTERN.test(lastName.trim())) {
    return 'Names may only contain letters, spaces, hyphens, apostrophes and periods.'
  }
  return null
}
