/**
 * NextAuth Middleware-Safe Configuration
 *
 * This file contains the auth config that can be safely imported in
 * Next.js middleware (edge runtime). It handles route protection and
 * role-based redirects but does NOT include providers that require
 * Node.js APIs (bcrypt, Prisma) — those live in auth.ts.
 *
 * Role lifecycle: INCOMPLETE → PENDING → MEMBER / ADMIN
 *   - INCOMPLETE: New Google sign-in, needs to enter real name
 *   - PENDING:    Name submitted, awaiting admin approval
 *   - MEMBER:     Approved, can view agendas
 *   - ADMIN:      Full access to admin panels
 */
import type { NextAuthConfig } from 'next-auth'

export const authConfig = {
  pages: {
    signIn: '/login', // Custom login page
  },
  providers: [], // Configured in auth.ts
  callbacks: {
    /** Route-level authorization — runs on every request in middleware. */
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user;
      const role = auth?.user?.role as string | undefined;
      const isOnAdmin = nextUrl.pathname.startsWith('/admin');
      const isOnAgenda = nextUrl.pathname.startsWith('/agenda');
      const isOnLogin = nextUrl.pathname === '/login';
      const isOnPending = nextUrl.pathname === '/pending';
      const isOnCompleteProfile = nextUrl.pathname === '/complete-profile';

      // --- Login page routing ---
      if (isOnLogin) {
        if (!isLoggedIn) return true;
        if (role === 'INCOMPLETE') return Response.redirect(new URL('/complete-profile', nextUrl));
        if (role === 'PENDING') return Response.redirect(new URL('/pending', nextUrl));
        if (role === 'ADMIN') return Response.redirect(new URL('/admin/calendar', nextUrl));
        return Response.redirect(new URL('/agenda', nextUrl));
      }

      // Profile Completion page: only INCOMPLETE users should see it
      if (isOnCompleteProfile) {
        if (!isLoggedIn) return false;
        if (role !== 'INCOMPLETE') return Response.redirect(new URL('/agenda', nextUrl));
        return true;
      }

      // Pending page: only PENDING users should see it
      if (isOnPending) {
        if (!isLoggedIn) return false;
        if (role === 'INCOMPLETE') return Response.redirect(new URL('/complete-profile', nextUrl));
        if (role !== 'PENDING') return Response.redirect(new URL('/agenda', nextUrl));
        return true;
      }

      // Admin Area Protection
      if (isOnAdmin) {
        if (!isLoggedIn) return false;
        if (role === 'INCOMPLETE') return Response.redirect(new URL('/complete-profile', nextUrl));
        if (role !== 'ADMIN') return Response.redirect(new URL('/agenda', nextUrl));
        return true;
      }

      // Agenda Module Protection
      if (isOnAgenda) {
        if (!isLoggedIn) return false;
        if (role === 'INCOMPLETE') return Response.redirect(new URL('/complete-profile', nextUrl));
        // PENDING users are denied
        if (role === 'PENDING') return Response.redirect(new URL('/pending', nextUrl));
        return true; // MEMBER and ADMIN
      }

      return true; // Unprotected routes
    },
    /** Attach role to JWT on sign-in. Overridden with richer logic in auth.ts. */
    jwt({ token, user }) {
        if (user) {
            token.role = user.role;
        }
        return token;
    },
    /** Expose role and user ID from JWT into the session object for client use. */
    session({ session, token }) {
        if (session.user && token) {
            session.user.role = token.role as string;
            session.user.id = token.sub as string;
        }
        return session;
    }
  },
} satisfies NextAuthConfig;
