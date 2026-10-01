/**
 * Profile Completion Page
 *
 * Shown to INCOMPLETE users after their first Google sign-in (or right after
 * registering with email + password on /signup).
 * Collects first/last name (decoupled from Google account name)
 * and transitions the user to PENDING for admin review.
 */
import { auth } from "@/auth";
import { redirect } from "next/navigation";
import ProfileForm from "@/components/profile/profile-form";
import { AuthCard, AuthPage, SignOutForm } from "@/components/common/auth-card";
import { Notice } from "@/components/common/surfaces";

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
    <AuthPage>
      <AuthCard
        title="Complete Your Profile"
        description={<>Signed in as <strong className="font-semibold text-gray-700">{session.user?.email}</strong></>}
      >
        <Notice tone="highlight" icon={false} className="mb-6 text-center">
          <p>
            {session.user?.authMethod === "credentials" ? (
              <>Please enter <strong>your own name</strong> below. This is how you will appear on meeting agendas and club records.</>
            ) : (
              <>Please enter <strong>your own name</strong> below — not the name on the Google account you used to sign in. This is how you will appear on meeting agendas and club records.</>
            )}
          </p>
        </Notice>

        <ProfileForm />

        <SignOutForm className="mt-6" />
      </AuthCard>
    </AuthPage>
  );
}
