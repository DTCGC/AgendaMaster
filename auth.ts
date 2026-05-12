/**
 * NextAuth Full Configuration
 *
 * Extends auth.config.ts with Node.js-only providers (Google OAuth, Credentials)
 * and richer callbacks that interact with the database.
 *
 * Exports: handlers (API route), auth (session getter), signIn, signOut,
 *          unstable_update (session mutation for role transitions).
 */

import NextAuth from 'next-auth';
import { authConfig } from './auth.config';
import Google from 'next-auth/providers/google';
import Credentials from 'next-auth/providers/credentials';
import { db } from '@/lib/db';
import bcrypt from 'bcryptjs';

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
    // --- Credentials: Admin-only email/password login ---
    Credentials({
        name: 'Admin Login',
        credentials: {
          email: { label: "Email", type: "email", placeholder: "admin@example.com" },
          password: { label: "Password", type: "password" }
        },
        async authorize(credentials) {
            if (!credentials?.email || !credentials?.password) return null;
            
            // Look up the user by email in the database
            const user = await db.user.findUnique({ 
                where: { email: credentials.email as string } 
            });
            
            // Only ADMIN users may use credential login; MEMBER accounts must use Google
            if (!user || user.role !== 'ADMIN' || !user.passwordHash) return null;
            
            // Verify password against bcrypt hash
            const isValid = await bcrypt.compare(credentials.password as string, user.passwordHash);
            
            if (isValid) {
                return {
                    id: user.id,
                    email: user.email,
                    name: `${user.firstName} ${user.lastName}`,
                    role: user.role,
                };
            }
            
            return null;
        }
    })
  ],
  callbacks: {
    ...authConfig.callbacks,
    /** Handle new Google sign-ins: create INCOMPLETE user record if first visit. */
    async signIn({ user, account, profile: _profile }) {
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
        } else if ((token.role === 'PENDING' || token.role === 'INCOMPLETE') && token.dbId) {
            // Live role refresh: check if admin has approved/denied while user waits
            const dbUser = await db.user.findUnique({ 
                where: { id: token.dbId as string }, 
                select: { role: true } 
            });
            if (dbUser) {
                token.role = dbUser.role;
            } else {
                token.role = 'DENIED'; // If account disappeared/was rejected
            }
        }
        
        // Persist Google OAuth tokens for Sheets/Drive/Gmail API calls
        if (account?.provider === 'google') {
            token.accessToken = account.access_token;
            token.refreshToken = account.refresh_token;
        }
        return token;
    },
    /** Expose role, DB ID, and access token from JWT into the client-visible session. */
    session({ session, token }) {
        if (session.user && token) {
            session.user.role = token.role as string;
            session.user.id = token.sub as string;
            session.user.dbId = token.dbId as string;
            session.user.accessToken = token.accessToken as string | undefined;
        }
        return session;
    }
  }
});
