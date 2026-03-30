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
                    const names = user.name?.split(' ') || ['User', ''];
                    await db.user.create({
                        data: {
                            email: user.email!,
                            firstName: profile?.given_name || names[0],
                            lastName: profile?.family_name || names[1] || '',
                            role: 'PENDING',
                        }
                    });
                    user.role = 'PENDING';
                } else {
                    user.role = existingUser.role;
                }
            } catch (error) {
                console.error("Error during Google sign in:", error);
                return false;
            }
        }
        return true;
    }
  }
});
