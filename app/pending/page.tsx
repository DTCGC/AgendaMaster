import { auth } from "@/auth";
import { redirect } from "next/navigation";

export default async function PendingPage() {
  const session = await auth();

  if (!session) {
    redirect('/api/auth/signin');
  }

  if (session.user?.role !== 'PENDING') {
    redirect('/agenda');
  }

  return (
    <div className="flex min-h-[calc(100vh-80px)] items-center justify-center p-4 bg-brand-cool-grey/20">
      <div className="max-w-md bg-white p-8 rounded-xl shadow-lg border text-center">
        <h1 className="text-3xl font-bold text-brand-loyal-blue mb-4">Account Pending</h1>
        <p className="text-gray-600 mb-6 leading-relaxed">
          Your account request has been successfully received, {session.user?.name}. An administrator must review and approve your access before you can view club agendas.
        </p>
        <p className="text-sm font-medium text-gray-400">
          You will receive an email once your account has been approved.
        </p>
      </div>
    </div>
  );
}
