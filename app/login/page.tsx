/**
 * Login Page
 *
 * The primary authentication entry point. Provides three access methods:
 *   1. Google OAuth (primary — for all members)
 *   2. Admin credentials (collapsible section — for exec-only access)
 *   3. Guest mailing list subscription (no account required)
 *
 * Redirects authenticated users based on their role state.
 */
import { auth, signIn } from "@/auth";
import Image from "next/image";
import { redirect } from "next/navigation";
import GuestSubscribe from "@/components/login/guest-subscribe";
import AdminLoginForm from "@/components/login/admin-login-form";

export default async function LoginPage() {
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
                className="w-24 h-auto"
            />
        </div>

        <h1 className="text-2xl font-black mb-2 text-center text-brand-loyal-blue tracking-tighter uppercase">Portal Access</h1>
        <p className="text-xs text-gray-400 text-center mb-8 max-w-[260px] leading-relaxed">
          Sign in with your Google account to access club agendas and communications.
        </p>

        {/* PRIMARY: Google OAuth for Members */}  
        <form
          className="w-full"
          action={async () => {
            "use server"
            await signIn("google", { redirectTo: '/agenda' })
          }}
        >
          <button type="submit" className="w-full bg-white border-2 border-brand-loyal-blue text-brand-loyal-blue font-bold rounded-xl p-3.5 hover:bg-brand-loyal-blue hover:text-white transition-all flex items-center justify-center gap-3 text-sm shadow-sm">
            <Image src="https://authjs.dev/img/providers/google.svg" alt="G" width={20} height={20} />
            Sign in with Google
          </button>
        </form>

        <p className="text-[10px] text-gray-400 mt-3 text-center italic max-w-[240px]">
          New members: Sign in with Google to request access. Your account will be reviewed by the Executive Team.
        </p>

        {/* ADMIN ACCESS — Collapsible Section */}
        <details className="w-full mt-8 group">
          <summary className="flex items-center w-full cursor-pointer select-none">
            <div className="flex-grow border-t border-gray-100"></div>
            <span className="px-4 text-[10px] font-bold text-gray-300 uppercase tracking-widest group-open:text-brand-true-maroon transition-colors">
              Admin Access
            </span>
            <div className="flex-grow border-t border-gray-100"></div>
          </summary>
          
          <div className="pt-6 animate-in fade-in slide-in-from-top-2 duration-300">
            <AdminLoginForm />
          </div>
        </details>

        {/* Guest Subscription Section */}
        <div className="w-full pt-8 border-t border-dashed mt-8">
            <GuestSubscribe />
        </div>

        <div className="text-center mt-6">
            <p className="text-[10px] text-gray-400 leading-relaxed max-w-[240px] italic">
                Authorized use only. Standard member applications are screened by the Executive Team after initial Google verification.
            </p>
        </div>
      </div>
    </div>
  );
}
