/**
 * Email/Password Signup Page
 *
 * The fallback registration path for the few members who cannot use a
 * Google account. Deliberately low-key: linked only from a small line on the
 * login page, and gated behind a notice steering people back to Google.
 * Accounts created here go through the same /complete-profile → /pending →
 * admin approval flow as Google sign-ups.
 */
import { auth } from "@/auth";
import { redirect } from "next/navigation";
import EmailSignup from "@/components/login/email-signup";
import { AuthCard, AuthPage } from "@/components/common/auth-card";

export const metadata = {
  title: "Register Without Google - DTCGC",
};

export default async function SignupPage() {
  const session = await auth();

  if (session) {
    if (session.user?.role === 'INCOMPLETE') redirect("/complete-profile");
    if (session.user?.role === 'PENDING') redirect("/pending");
    if (session.user?.role === 'ADMIN') redirect("/admin/calendar");
    redirect("/agenda");
  }

  return (
    <AuthPage>
      <AuthCard title="Register Without Google">
        <EmailSignup />
      </AuthCard>
    </AuthPage>
  );
}
