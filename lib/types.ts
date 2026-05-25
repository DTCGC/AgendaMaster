/**
 * Shared Type Definitions
 *
 * Centralizes application-specific types derived from Prisma models.
 * Importing from here (instead of using `any`) gives the entire codebase
 * compile-time safety and editor autocompletion.
 *
 * Base model types (User, Meeting, etc.) are re-exported directly from
 * @prisma/client. Composite types with relations or computed fields are
 * defined here as intersections or standalone interfaces.
 */

import type {
  User as PrismaUser,
  Meeting as PrismaMeeting,
  RoleAssignment as PrismaRoleAssignment,
  MeetingTemplate as PrismaMeetingTemplate,
  Subscriber as PrismaSubscriber,
} from '@prisma/client'

// ─── Re-exported Base Prisma Types ──────────────────────────────────────────

export type User = PrismaUser
export type Meeting = PrismaMeeting
export type RoleAssignment = PrismaRoleAssignment
export type MeetingTemplate = PrismaMeetingTemplate
export type Subscriber = PrismaSubscriber

// ─── Query-Specific "Fat" Types (with relations) ───────────────────────────

/** User with their role assignment history included. */
export type UserWithRoleAssignments = PrismaUser & {
  roleAssignments: PrismaRoleAssignment[]
}

/** Meeting with all role assignments (including linked users) and template. */
export type MeetingWithDetails = PrismaMeeting & {
  roleAssignments: RoleAssignmentWithUser[]
  template: PrismaMeetingTemplate
}

/** A single role assignment row with its linked user resolved. */
export type RoleAssignmentWithUser = PrismaRoleAssignment & {
  user: PrismaUser | null
}

// ─── Application-Specific Composite Types ──────────────────────────────────

/** User with a computed displayName for UI rendering (avoids Prisma mutation). */
export type UserWithDisplayName = {
  id: string
  firstName: string
  lastName: string
  displayName: string
}

/** Pre-assigned major role with user info attached. */
export type PreAssignedMajorRole = {
  id: string
  meetingId: string
  userId: string | null
  roleName: string
  assignedAt: Date
  user: UserWithDisplayName | null
}

/** The shape returned by getAutoAssignments() in agenda-logic.ts. */
export type AutoAssignmentResult = {
  assignments: Record<string, UserWithDisplayName | null>
  unassigned: UserWithDisplayName[]
  preAssignedMajor: PreAssignedMajorRole[]
}
