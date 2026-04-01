import type { NextAuthConfig } from 'next-auth'

export const authConfig = {
  pages: {
    signIn: '/login', // Custom login page
  },
  providers: [], // Configured in auth.ts
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user;
      const role = auth?.user?.role as string | undefined;
      const isOnAdmin = nextUrl.pathname.startsWith('/admin');
      const isOnAgenda = nextUrl.pathname.startsWith('/agenda');
      const isOnLogin = nextUrl.pathname === '/login';
      const isOnPending = nextUrl.pathname === '/pending';
      const isOnCompleteProfile = nextUrl.pathname === '/complete-profile';

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
    jwt({ token, user }) {
        if (user) {
            token.role = user.role;
        }
        return token;
    },
    session({ session, token }) {
        if (session.user && token) {
            session.user.role = token.role as string;
            session.user.id = token.sub as string;
        }
        return session;
    }
  },
} satisfies NextAuthConfig;
