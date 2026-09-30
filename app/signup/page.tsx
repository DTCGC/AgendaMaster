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
import Image from "next/image";
import { redirect } from "next/navigation";
import EmailSignup from "@/components/login/email-signup";

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
    <div className="flex min-h-[calc(100vh-80px)] items-center justify-center p-4 bg-brand-cool-grey/20">
      <div className="w-full max-w-sm p-8 bg-white rounded-2xl shadow-2xl border border-gray-100 flex flex-col items-center">

        <div className="mb-6">
          <Image
            src="/assets/images/LoyalBlue/GavelClubLogoLoyalBlue-RGB.png"
            alt="DTCGC Logo"
            width={1140}
            height={1140}
            className="w-20 h-auto"
          />
        </div>

        <h1 className="text-2xl font-black mb-6 text-center text-brand-loyal-blue tracking-tighter uppercase">
          Register Without Google
        </h1>

        <EmailSignup />
      </div>
    </div>
  );
}
