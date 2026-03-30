import { auth } from "@/auth";
import { db } from "@/lib/db";
import { redirect } from "next/navigation";
import Link from "next/link";
import AgendaWizard from "@/components/agenda/wizard";
import { AlertCircle, Calendar } from "lucide-react";

export const metadata = {
  title: "Agenda Creation - DTCGC",
}

export default async function CreateAgendaPage() {
  const session = await auth();

  if (!session?.user) {
    redirect('/login');
  }

  // Find the closest upcoming SCHEDULED meeting
  const nextMeeting = await db.meeting.findFirst({
    where: {
        date: { gte: new Date() },
        status: 'SCHEDULED'
    },
    include: {
        roleAssignments: {
            where: { roleName: 'Toastmaster' }
        }
    },
    orderBy: { date: 'asc' }
  });

  if (!nextMeeting) {
    return (
        <div className="flex-1 p-8 bg-brand-cool-grey/10 min-h-screen flex items-center justify-center">
            <div className="max-w-md bg-white p-8 rounded-xl shadow-lg border border-gray-200 text-center space-y-4">
                <Calendar size={48} className="mx-auto text-brand-loyal-blue/30" />
                <h2 className="text-2xl font-bold text-gray-800">No Meetings Scheduled</h2>
                <div className="pt-4">
                    <Link href="/agenda" className="block w-full bg-brand-loyal-blue text-white py-3 rounded-xl font-bold hover:bg-opacity-90 transition-all shadow-md">
                        Return to Dashboard
                    </Link>
                </div>
            </div>
        </div>
    )
}

  // Authorization: STRICTLY enforced Toastmaster-only access.
  const isToastmaster = nextMeeting.roleAssignments[0]?.userId === session.user.id;

  if (!isToastmaster) {
    return (
        <div className="flex-1 p-8 bg-brand-cool-grey/10 min-h-screen flex items-center justify-center">
            <div className="max-w-md bg-white p-8 rounded-xl shadow-lg border border-red-100 text-center space-y-4">
                <AlertCircle size={48} className="mx-auto text-red-500" />
                <h2 className="text-2xl font-bold text-gray-800">Toastmaster Access Only</h2>
                <p className="text-gray-600 font-medium">You aren't listed as the Toastmaster for the meeting on <strong>{nextMeeting.date.toLocaleDateString()}</strong>.</p>
                <p className="text-xs text-gray-400">Administrators may assign themselves the Toastmaster role via the Role Panel to gain access.</p>
                <div className="pt-4 px-8">
                    <Link href="/agenda" className="block w-full bg-brand-loyal-blue text-white py-3 rounded-xl font-bold hover:bg-opacity-90 transition-all shadow-md">
                        Return to Dashboard
                    </Link>
                </div>
            </div>
        </div>
    )
  }

  return (
    <div className="flex-1 p-8 bg-brand-cool-grey/10 min-h-screen">
      <div className="max-w-5xl mx-auto">
        <div className="mb-8 border-b pb-6">
            <h1 className="text-4xl font-extrabold text-brand-loyal-blue tracking-tight">Agenda Engine</h1>
            <div className="mt-2 flex items-center gap-2 text-brand-true-maroon font-bold text-sm bg-brand-true-maroon/5 w-fit px-3 py-1 rounded-full border border-brand-true-maroon/20">
                <Calendar size={14} /> Preparing for meeting on: {nextMeeting.date.toLocaleDateString()}
            </div>
        </div>
        
        <AgendaWizard meetingId={nextMeeting.id} />
      </div>
    </div>
  );
}
