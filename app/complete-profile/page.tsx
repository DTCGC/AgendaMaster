/**
 * Profile Completion Page
 *
 * Shown to INCOMPLETE users after their first Google sign-in.
 * Collects first/last name (decoupled from Google account name)
 * and transitions the user to PENDING for admin review.
 */
import { auth, signOut } from "@/auth";
import { redirect } from "next/navigation";
import Image from "next/image";
import { LogOut } from "lucide-react";
import ProfileForm from "@/components/profile/profile-form";

export const metadata = {
  title: "Complete Your Profile - DTCGC",
};

/**
 * Profile completion page shown to first-time Google OAuth users.
 * 
 * Since members may sign in with a parent's or shared Google account,
 * we collect their actual name here instead of relying on the Google profile.
 * After submission, they enter the standard PENDING approval queue.
 */
export default async function CompleteProfilePage() {
  const session = await auth();

  if (!session) {
    redirect("/login");
  }

  if (session.user?.role !== "INCOMPLETE") {
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

        <h1 className="text-2xl font-black mb-1 text-center text-brand-loyal-blue tracking-tighter uppercase">
          Complete Your Profile
        </h1>

        <p className="text-xs text-gray-400 text-center mb-2 max-w-[280px] leading-relaxed">
          Signed in as <strong className="text-gray-600">{session.user?.email}</strong>
        </p>

        <div className="w-full bg-brand-happy-yellow/10 border border-brand-happy-yellow/30 rounded-lg p-3 mb-6">
          <p className="text-[11px] text-yellow-800 leading-relaxed text-center font-medium">
            Please enter <strong>your own name</strong> below — not the name on the Google account you used to sign in. This is how you will appear on meeting agendas and club records.
          </p>
        </div>

        <div className="w-full">
          <ProfileForm />
        </div>

        <form
          className="mt-6"
          action={async () => {
            "use server";
            await signOut({ redirectTo: "/" });
          }}
        >
          <button className="flex items-center justify-center gap-2 text-xs font-bold text-gray-400 hover:text-gray-600 transition-colors">
            <LogOut size={14} />
            Sign Out
          </button>
        </form>
      </div>
    </div>
  );
}
