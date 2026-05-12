/**
 * NextAuth API Route Handler
 *
 * Exports GET and POST handlers from the auth configuration.
 * Serves all /api/auth/* endpoints (sign-in, sign-out, callback, etc.).
 */
import { handlers } from "@/auth"
export const { GET, POST } = handlers
