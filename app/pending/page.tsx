/**
 * Pending Approval Holding Page
 *
 * Displayed to PENDING users while their account awaits admin approval.
 * Auto-refreshes to detect role transitions via the JWT callback in auth.ts.
 */
import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { Clock } from "lucide-react";
import { AuthCard, AuthPage, SignOutForm } from "@/components/common/auth-card";
import { db } from "@/lib/db";
import { getDisplayName } from "@/lib/user-logic";
import ApprovalWatcher from "@/components/pending/approval-watcher";

export default async function PendingPage() {
  const session = await auth();

  if (!session) {
    redirect('/login');
  }

  // NOTE: We intentionally do NOT redirect away when role !== 'PENDING' here.
  // The edge middleware gates access using the (possibly stale) cookie role,
  // while auth() above returns the freshly-revalidated DB role. When an admin
  // has just approved the user, those two disagree — a server redirect to
  // /agenda would bounce off the middleware straight back to /pending, causing
  // an infinite "page isn't redirecting properly" loop. Instead, ApprovalWatcher
  // syncs the cookie client-side, then navigates once the roles agree.

  // Fetch the user's real name from the DB and apply display logic
  const dbUser = await db.user.findUnique({ where: { id: session.user.dbId } });
  const allUsers = await db.user.findMany(); // Include themselves to properly count collisions
  const displayName = dbUser ? getDisplayName(dbUser, allUsers) : "Member";

  return (
    <AuthPage>
      <ApprovalWatcher />
      <AuthCard title="Account Pending" icon={Clock} width="md">
        <div className="space-y-4 text-center">
          <p className="leading-relaxed text-gray-600">
            Your account request has been successfully received, <strong className="text-brand-true-maroon">{displayName}</strong>. An administrator must review and approve your access before you can view club agendas.
          </p>
          <p className="text-sm leading-relaxed text-gray-500">
            You will receive an email at <strong className="font-semibold text-gray-700">{session.user?.email}</strong> once your account has been approved.
          </p>
        </div>
        <SignOutForm className="mt-8" />
      </AuthCard>
    </AuthPage>
  );
}
