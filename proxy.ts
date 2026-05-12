/**
 * NextAuth Middleware Proxy
 *
 * This file is the Next.js middleware entry point. It imports auth.config.ts
 * (which is edge-runtime safe) to enforce route protection on every navigation.
 *
 * The matcher excludes API routes, static assets, and image optimization
 * from middleware processing to avoid unnecessary auth checks.
 */

import NextAuth from 'next-auth';
import { authConfig } from './auth.config';

export const { auth: proxy } = NextAuth(authConfig);
export default proxy;

/** Routes to apply middleware to. Excludes API, static files, and images. */
export const config = {
  matcher: ['/((?!api|_next/static|_next/image|.*\\.png$).*)'],
};
