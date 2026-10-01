/**
 * NextAuth Full Configuration
 *
 * Extends auth.config.ts with Node.js-only providers (Google OAuth for members,
 * email/password Credentials for admins and members without Google) and richer
 * callbacks that interact with the database.
 *
 * Exports: handlers (API route), auth (session getter), signIn, signOut,
 *          unstable_update (session mutation for role transitions).
 */

import NextAuth from 'next-auth';
import { authConfig } from './auth.config';
import Google from 'next-auth/providers/google';
import Credentials from 'next-auth/providers/credentials';
import { db } from '@/lib/db';
import { verifyPasswordLogin } from '@/lib/password-auth';
import { CLUB_GOOGLE_EMAIL, saveClubGoogleConnection } from '@/lib/club-google';

export const { handlers, auth, signIn, signOut, unstable_update } = NextAuth({
  ...authConfig,
  session: { strategy: 'jwt' },  // Stateless JWT sessions (no DB session table)
  providers: [
    // --- Google OAuth: Primary login for all members ---
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      authorization: {
        params: {
          // Request offline access for refresh token + required API scopes
          access_type: 'offline',
          prompt: 'consent',
          scope: [
            'openid',
            'email',
            'profile',
            'https://www.googleapis.com/auth/gmail.send',
            'https://www.googleapis.com/auth/drive.file',
          ].join(' '),
        },
      },
    }),
    // --- Credentials: email/password login ---
    // Used by the club's shared ADMIN credential AND by the rare members who
    // registered without a Google account (see lib/password-auth.ts).
    Credentials({
        name: 'Email Login',
        credentials: {
          email: { label: "Email", type: "email" },
          password: { label: "Password", type: "password" }
        },
        async authorize(credentials) {
            return verifyPasswordLogin(
                (credentials?.email as string) ?? '',
                (credentials?.password as string) ?? ''
            );
        }
    })
  ],
  callbacks: {
    ...authConfig.callbacks,
    /** Handle new Google sign-ins: create INCOMPLETE user record if first visit. */
    async signIn({ user, account }) {
        if (account?.provider === 'google') {
            try {
                const existingUser = await db.user.findUnique({
                    where: { email: user.email! }
                });
                
                if (!existingUser) {
                    // New Google sign-in → create INCOMPLETE account
                    // Name fields are empty — the user will provide their real
                    // name on /complete-profile before entering the approval queue.
                    const newUser = await db.user.create({
                        data: {
                            email: user.email!,
                            firstName: '',
                            lastName: '',
                            role: 'INCOMPLETE',
                        }
                    });
                    user.role = 'INCOMPLETE';
                    user.id = newUser.id;
                } else {
                    user.role = existingUser.role;
                    user.id = existingUser.id;
                }
            } catch (error) {
                console.error("Error during Google sign in:", error);
                return false;
            }
        }
        return true;
    },
    /**
     * JWT callback: persist user metadata and Google tokens.
     * On subsequent requests, re-checks DB role for PENDING/INCOMPLETE users
     * so that admin approvals take effect without requiring re-login.
     */
    async jwt({ token, user, account }) {
        // On initial sign-in, persist user metadata + Google OAuth tokens
        if (user) {
            // Initial sign-in: seed the token with user metadata
            token.role = user.role;
            token.dbId = user.id;
            // HOW they signed in decides which Google credential the agenda
            // pipeline uses (lib/google-auth-path.ts) — see types/next-auth.d.ts.
            token.authMethod = account?.provider === 'google' ? 'google' : 'credentials';
        } else if (token.dbId) {
            // Live revalidation on EVERY subsequent request so that admin
            // approvals (PENDING → MEMBER), role changes, and account
            // deletions take effect WITHOUT requiring a logout/login.
            //
            // Previously this only ran for PENDING/INCOMPLETE, which meant an
            // approved member kept a stale PENDING token (redirect loop to
            // /pending) and a deleted member kept a valid MEMBER token forever
            // ("Welcome, Member" with no eviction).
            const dbUser = await db.user.findUnique({
                where: { id: token.dbId as string },
                select: { role: true }
            });
            token.role = dbUser ? dbUser.role : 'DELETED'; // account removed/rejected
        }
        
        // Persist Google OAuth tokens for Sheets/Drive/Gmail API calls. They
        // stay in the encrypted cookie only — lib/google-user-token.ts reads
        // and refreshes them server-side.
        if (account?.provider === 'google') {
            token.accessToken = account.access_token;
            token.refreshToken = account.refresh_token;
            token.accessTokenExpires = account.expires_at ? account.expires_at * 1000 : undefined;

            // An admin signing in with Google as the club account (the
            // "Connect" button on Member Management) stores that account's
            // refresh token, so agendas of members without Google can be
            // created and emailed through it. Never allowed to block a login.
            if (
                account.refresh_token &&
                (user?.email ?? token.email)?.toLowerCase() === CLUB_GOOGLE_EMAIL &&
                token.role === 'ADMIN'
            ) {
                try {
                    await saveClubGoogleConnection(account.refresh_token);
                } catch (error) {
                    console.error("Failed to store the club Google connection:", error);
                }
            }
        }
        return token;
    },
    /**
     * Expose role, DB ID and sign-in method to the session. The Google tokens
     * are deliberately left out: this object is also served to the browser.
     */
    session({ session, token }) {
        if (session.user && token) {
            session.user.role = token.role;
            session.user.id = token.dbId ?? token.sub ?? '';
            session.user.dbId = token.dbId;
            session.user.authMethod = token.authMethod;
        }
        return session;
    }
  }
});
