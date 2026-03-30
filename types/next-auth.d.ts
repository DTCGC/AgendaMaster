import NextAuth, { type DefaultSession } from 'next-auth'

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
