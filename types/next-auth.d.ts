/**
 * NextAuth Type Augmentations
 *
 * Extends the default NextAuth Session, User, and JWT types with
 * AgendaMaster-specific fields (role, dbId, accessToken, refreshToken).
 * This makes TypeScript aware of custom properties attached via auth callbacks.
 */
import type { DefaultSession } from 'next-auth'

declare module 'next-auth' {
  interface Session {
    user: {
      role?: string
      dbId?: string
      accessToken?: string
    } & DefaultSession['user']
  }

  interface User {
    role?: string
  }
}

declare module '@auth/core/jwt' {
  interface JWT {
    role?: string
    dbId?: string
    accessToken?: string
    refreshToken?: string
  }
}
