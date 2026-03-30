import { auth, signOut } from "@/auth";
import { redirect } from "next/navigation";
import { Clock, LogOut } from "lucide-react";

export default async function PendingPage() {
  const session = await auth();

  if (!session) {
    redirect('/login');
  }

  if (session.user?.role !== 'PENDING') {
    redirect('/agenda');
  }

  return (
    <div className="flex min-h-[calc(100vh-80px)] items-center justify-center p-4 bg-brand-cool-grey/20">
      <div className="max-w-md bg-white p-8 rounded-xl shadow-lg border text-center space-y-6">
        <div className="mx-auto w-16 h-16 bg-brand-loyal-blue/10 rounded-full flex items-center justify-center">
            <Clock size={32} className="text-brand-loyal-blue" />
        </div>
        
        <h1 className="text-3xl font-bold text-brand-loyal-blue">Account Pending</h1>
        <p className="text-gray-600 leading-relaxed">
          Your account request has been successfully received, <strong className="text-brand-true-maroon">{session.user?.name?.split(' ')[0]}</strong>. An administrator must review and approve your access before you can view club agendas.
        </p>
        <p className="text-sm font-medium text-gray-400">
          You will receive an email at <strong>{session.user?.email}</strong> once your account has been approved.
        </p>

        <form action={async () => {
            "use server"
            await signOut({ redirectTo: '/' })
        }}>
            <button className="flex items-center justify-center gap-2 mx-auto text-sm font-bold text-gray-500 hover:text-gray-700 bg-gray-100 px-6 py-2.5 rounded-lg hover:bg-gray-200 transition-colors mt-4">
                <LogOut size={16} />
                Sign Out
            </button>
        </form>
      </div>
    </div>
  );
}
