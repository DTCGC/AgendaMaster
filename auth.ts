import NextAuth from 'next-auth';
import { authConfig } from './auth.config';
import Google from 'next-auth/providers/google';
import Credentials from 'next-auth/providers/credentials';
import { db } from '@/lib/db';
import bcrypt from 'bcryptjs';

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  session: { strategy: 'jwt' },
  providers: [
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
            'https://www.googleapis.com/auth/spreadsheets',
            'https://www.googleapis.com/auth/drive.file',
          ].join(' '),
        },
      },
    }),
    Credentials({
        name: 'Admin Login',
        credentials: {
          email: { label: "Email", type: "email", placeholder: "admin@example.com" },
          password: { label: "Password", type: "password" }
        },
        async authorize(credentials) {
            if (!credentials?.email || !credentials?.password) return null;
            
            const user = await db.user.findUnique({ 
                where: { email: credentials.email as string } 
            });
            
            // Limit generic credential login to ADMINs ONLY
            if (!user || user.role !== 'ADMIN' || !user.passwordHash) return null;
            
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
    async signIn({ user, account, profile }) {
        if (account?.provider === 'google') {
            try {
                const existingUser = await db.user.findUnique({
                    where: { email: user.email! }
                });
                
                if (!existingUser) {
                    // New Google sign-in → create PENDING account
                    const newUser = await db.user.create({
                        data: {
                            email: user.email!,
                            firstName: profile?.given_name || user.name?.split(' ')[0] || 'User',
                            lastName: profile?.family_name || user.name?.split(' ').slice(1).join(' ') || '',
                            role: 'PENDING',
                        }
                    });
                    user.role = 'PENDING';
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
    async jwt({ token, user, account }) {
        // On initial sign-in, persist user metadata + Google OAuth tokens
        if (user) {
            token.role = user.role;
            token.dbId = user.id;
        }
        if (account?.provider === 'google') {
            token.accessToken = account.access_token;
            token.refreshToken = account.refresh_token;
        }
        return token;
    },
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
