import { auth } from "@/auth";
import { db } from "@/lib/db";
import { redirect } from "next/navigation";
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
                <p className="text-gray-600">The Agenda Engine requires an upcoming active meeting block. An administrator must first schedule a Friday in the Master Calendar.</p>
                <button onClick={() => redirect('/agenda')} className="w-full bg-brand-loyal-blue text-white py-2 rounded-lg font-bold">Return to Dashboard</button>
            </div>
        </div>
    )
  }

  // Authorization: Must be Admin OR the assigned Toastmaster
  const isToastmaster = nextMeeting.roleAssignments[0]?.userId === session.user.id;
  const isAdmin = session.user.role === 'ADMIN';

  if (!isToastmaster && !isAdmin) {
    return (
        <div className="flex-1 p-8 bg-brand-cool-grey/10 min-h-screen flex items-center justify-center">
            <div className="max-w-md bg-white p-8 rounded-xl shadow-lg border border-red-100 text-center space-y-4">
                <AlertCircle size={48} className="mx-auto text-red-500" />
                <h2 className="text-2xl font-bold text-gray-800">Access Denied</h2>
                <p className="text-gray-600">You are not designated as the Toastmaster for the meeting on <strong>{nextMeeting.date.toLocaleDateString()}</strong>.</p>
                <p className="text-sm text-gray-400">Please contact a club executive if you believe this is an error.</p>
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
                <Calendar size={14} /> Targeting Meeting: {nextMeeting.date.toLocaleDateString()}
            </div>
        </div>
        
        <AgendaWizard meetingId={nextMeeting.id} />
      </div>
    </div>
  );
}
