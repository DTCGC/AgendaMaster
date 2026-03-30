import { auth } from "@/auth";
import { db } from "@/lib/db";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Calendar, FileText } from "lucide-react";
import { getDisplayName } from '@/lib/user-logic';

export default async function AgendaPage() {
  const session = await auth();
  
  if (!session?.user) redirect('/login');

  // Find the closest upcoming SCHEDULED meeting
  const nextMeeting = await db.meeting.findFirst({
    where: { date: { gte: new Date() }, status: 'SCHEDULED' },
    include: { 
        roleAssignments: {
            include: { user: true }
        } 
    },
    orderBy: { date: 'asc' }
  });

  const userFirstName = session.user.name?.split(' ')[0] || "Member";

  if (!nextMeeting) {
    return (
        <div className="flex-1 p-8 bg-brand-cool-grey/10 min-h-screen">
          <div className="max-w-4xl mx-auto space-y-6">
            <div className="bg-white p-8 rounded-xl shadow-md border-t-8 border-gray-300">
                <h1 className="text-4xl font-black text-gray-800 mb-2 tracking-tight">Meeting Dashboard</h1>
                <p className="text-gray-500 mb-12 border-b pb-4 flex items-center gap-2">
                    Welcome, <span className="text-brand-true-maroon font-bold">{userFirstName}</span>. Review the operating schedule below.
                </p>
                <div className="p-20 text-center text-gray-300 border-4 border-dashed rounded-2xl bg-gray-50/50 flex flex-col items-center gap-4">
                    <Calendar size={48} className="opacity-20" />
                    <div className="font-mono text-sm uppercase tracking-widest opacity-50 font-bold">No Active Meetings Scheduled</div>
                    <p className="text-xs max-w-xs text-gray-400">The club calendar is currently clear. Admins will update the schedule for the next academic cycle shortly.</p>
                </div>
            </div>
          </div>
        </div>
      );
  }

  const isToastmaster = nextMeeting.roleAssignments.find((a: any) => a.roleName === 'Toastmaster')?.userId === session.user.id;

  // Compute final roster in correct order
  const roleSequence = [
    "Sergeant at Arms", "Toastmaster", "Timer", "Grammarian", "Filler Word Counter", "Quizmaster",
    "Speaker 1", "Speaker 2", "Speaker 3", "Evaluator 1", "Evaluator 2", "Evaluator 3",
    "Roles For Next Meeting", "Business Meeting", "Table Topics Master", "Table Topics Evaluator 1", "Table Topics Evaluator 2"
  ];

  // Fetch all active members for display name collision detection
  const allMembers = await db.user.findMany({ where: { role: { in: ['MEMBER', 'ADMIN'] } } });

  const agendaItems = roleSequence.map(role => {
      const assignment = nextMeeting.roleAssignments.find((a: any) => a.roleName === role);
      if (role === "Roles For Next Meeting") return { role, name: "John" };
      if (role === "Business Meeting") return { role, name: "Andrew" };
      
      const user = assignment?.user;
      return {
          role,
          name: user ? getDisplayName(user as any, allMembers as any) : "TBD"
      };
  });

  const hasFinalized = (nextMeeting.roleAssignments.length || 0) > 1;

  return (
    <div className="flex-1 p-8 bg-brand-cool-grey/10 min-h-screen">
      <div className="max-w-4xl mx-auto space-y-6 pb-12">
        
        <div className="bg-white p-8 rounded-xl shadow-md border-t-8 border-brand-loyal-blue transition-all hover:shadow-lg">
            <h1 className="text-4xl font-black text-brand-loyal-blue mb-2 tracking-tight">Meeting Dashboard</h1>
            <p className="text-gray-500 mb-8 border-b pb-4 flex items-center gap-2">
                Welcome, <span className="text-brand-true-maroon font-bold">{userFirstName}</span>. Review the operating schedule below.
            </p>

            {isToastmaster && (
            <div className="mb-12 p-6 bg-brand-happy-yellow/10 rounded-xl border-2 border-brand-happy-yellow shadow-sm animate-in fade-in slide-in-from-top-4 duration-500">
                <div className="flex gap-4">
                    <div className="bg-brand-happy-yellow text-white p-3 rounded-lg self-start shadow-md">
                        <FileText size={24} />
                    </div>
                    <div>
                        <h2 className="text-xl font-bold text-gray-800 mb-1 tracking-tight">Toastmaster Designation</h2>
                        <p className="text-sm text-gray-600 mb-6 max-w-md">You are the lead for the meeting on <strong className="text-brand-true-maroon">{nextMeeting.date.toLocaleDateString()}</strong>. Access the automated workflow to build the agenda.</p>
                        <Link href="/agenda/create" className="bg-brand-loyal-blue text-white font-bold py-3 px-8 rounded-xl shadow-lg hover:bg-brand-loyal-blue/90 transition-all inline-block hover:-translate-y-0.5 transform">
                            {hasFinalized ? 'Update Agenda' : 'Start Workflow'}
                        </Link>
                    </div>
                </div>
            </div>
            )}
            
            {!hasFinalized ? (
                <div className="p-20 text-center text-gray-300 border-4 border-dashed rounded-2xl bg-gray-50/50 flex flex-col items-center gap-4">
                    <Calendar size={48} className="opacity-20" />
                    <div className="font-mono text-sm uppercase tracking-widest opacity-50 font-bold">Agenda Data Stream Pending</div>
                    <p className="text-xs max-w-xs text-gray-400">The assigned Toastmaster has not yet finalized the attendee roster for the upcoming meeting.</p>
                </div>
            ) : (
                <div className="space-y-4">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="font-black text-gray-400 uppercase tracking-widest text-xs">Live Agenda Stream</h3>
                        <div className="flex items-center gap-2 text-[10px] font-bold text-green-600 bg-green-50 px-2 py-0.5 rounded-full border border-green-200">
                            <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
                            FINALIZED
                        </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {agendaItems.map((item, idx) => (
                            <div key={idx} className="flex justify-between items-center p-3 bg-gray-50 border rounded-xl hover:bg-white transition-all group">
                                <span className="text-sm font-bold text-gray-500 group-hover:text-brand-loyal-blue transition-colors">{item.role}</span>
                                <span className={`text-sm font-black tracking-tight px-3 py-1 rounded-lg ${item.name === 'TBD' ? 'text-red-300 bg-red-50/50 italic' : 'text-brand-loyal-blue bg-white shadow-sm border'}`}>
                                    {item.name}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
      </div>
    </div>
  );
}
