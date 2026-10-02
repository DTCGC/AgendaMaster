/**
 * Login Page
 *
 * The primary authentication entry point. Provides three access methods:
 *   1. Google OAuth (primary — for all members)
 *   2. Email & password (collapsible section — the admin credential, plus the
 *      rare members who registered without Google via /signup)
 *   3. Guest mailing list subscription (no account required)
 *
 * Redirects authenticated users based on their role state.
 */
import { auth, signIn } from "@/auth";
import Link from "next/link";
import { ChevronDown, ExternalLink } from "lucide-react";
import { AuthCard, AuthPage } from "@/components/common/auth-card";
import { redirect } from "next/navigation";
import GuestSubscribe from "@/components/login/guest-subscribe";
import EmailLoginForm from "@/components/login/email-login-form";
import { CREATE_GOOGLE_ACCOUNT_URL } from "@/lib/links";

const LINK = "font-semibold text-brand-loyal-blue underline-offset-2 hover:underline";

export default async function LoginPage() {
  const session = await auth();

  if (session) {
    if (session.user?.role === 'INCOMPLETE') redirect("/complete-profile");
    if (session.user?.role === 'PENDING') redirect("/pending");
    if (session.user?.role === 'ADMIN') redirect("/admin/calendar");
    redirect("/agenda");
  }

  return (
    <AuthPage>
      <AuthCard
        title="Portal Access"
        description="Sign in with your Google account to access club agendas and communications."
      >
        {/* PRIMARY: Google OAuth for Members */}
        <form
          action={async () => {
            "use server"
            await signIn("google", { redirectTo: '/agenda' })
          }}
        >
          <button
            type="submit"
            className="flex h-12 w-full items-center justify-center gap-3 rounded-xl border-2 border-brand-loyal-blue bg-white text-sm font-bold text-brand-loyal-blue shadow-sm transition-colors outline-none hover:bg-brand-loyal-blue/5 focus-visible:ring-3 focus-visible:ring-brand-loyal-blue/30"
          >
            <GoogleLogo />
            Sign in with Google
          </button>
        </form>

        {/* Kept to two short lines; the footer below already says new accounts are reviewed. */}
        <div className="mt-4 space-y-1.5 text-center text-xs leading-relaxed text-balance text-gray-500">
          <p>
            New members: sign in with Google to request access.{" "}
            <Link href="/tutorial#create-account" className={LINK}>
              How it works
            </Link>
          </p>
          <p>
            No Google account?{" "}
            <a href={CREATE_GOOGLE_ACCOUNT_URL} target="_blank" rel="noopener noreferrer" className={LINK}>
              Create one
              <ExternalLink size={11} className="ml-0.5 inline align-baseline" aria-hidden="true" />
              <span className="sr-only"> (opens Google Help in a new tab)</span>
            </a>{" "}
            or{" "}
            <Link href="/signup" className={LINK}>
              use email
            </Link>
          </p>
        </div>

        {/* EMAIL & PASSWORD — Collapsible Section (admins + members without Google) */}
        <details className="group mt-8 w-full">
          <summary className="flex w-full cursor-pointer list-none items-center gap-3 select-none [&::-webkit-details-marker]:hidden">
            <span className="flex-1 border-t border-gray-200" />
            <span className="flex items-center gap-1 text-xs font-bold uppercase tracking-widest text-gray-500 transition-colors group-open:text-brand-loyal-blue hover:text-brand-loyal-blue">
              Email &amp; Password
              <ChevronDown size={14} className="transition-transform group-open:rotate-180" />
            </span>
            <span className="flex-1 border-t border-gray-200" />
          </summary>

          <div className="pt-6 animate-in fade-in slide-in-from-top-2 duration-300">
            <EmailLoginForm />
          </div>
        </details>

        {/* Guest Subscription Section */}
        <div className="mt-8 w-full border-t border-dashed border-gray-200 pt-8">
          <GuestSubscribe />
        </div>

        <p className="mt-6 text-center text-xs leading-relaxed text-gray-400">
          Authorized use only. Standard member applications are screened by the Executive Team before access is granted.
        </p>
      </AuthCard>
    </AuthPage>
  );
}

/** Google's "G" mark, inline so the login page doesn't fetch it from a third party. */
function GoogleLogo() {
  return (
    <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}
