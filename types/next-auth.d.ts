/**
 * NextAuth Type Augmentations
 *
 * Extends the default NextAuth Session, User, and JWT types with
 * AgendaMaster-specific fields (role, dbId, authMethod; the JWT also carries
 * the Google tokens, which never reach the session — see lib/google-user-token.ts).
 * This makes TypeScript aware of custom properties attached via auth callbacks.
 */
import type { DefaultSession } from 'next-auth'

declare module 'next-auth' {
  interface Session {
    user: {
      role?: string
      dbId?: string
      /** How this session signed in — see lib/google-auth-path.ts. */
      authMethod?: 'google' | 'credentials'
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
    /** Epoch ms when accessToken expires. */
    accessTokenExpires?: number
    authMethod?: 'google' | 'credentials'
  }
}
