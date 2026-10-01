/**
 * Member Meeting Dashboard
 *
 * The main member-facing view. Displays the upcoming meeting's role roster
 * and shows a special CTA panel if the logged-in user is the Toastmaster.
 * Once the roster is finalized, every member also sees their own role(s) in a
 * banner, with their rows highlighted and tagged "You" in the roster.
 *
 * Also serves as the archive viewer when accessed with `?archivedId=<id>`.
 */
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Calendar, FileText, UserCheck } from "lucide-react";
import { getDisplayName } from '@/lib/user-logic';
import { MINOR_ROLES } from '@/lib/agenda-logic';
import ForceSignOut from '@/components/auth/force-sign-out';

export default async function AgendaPage(props: { searchParams?: Promise<{ archivedId?: string }> }) {
  const session = await auth();
  const searchParams = await props.searchParams;
  const archivedId = searchParams?.archivedId;
  
  if (!session?.user) redirect('/login');

  let nextMeeting;
  if (archivedId) {
    nextMeeting = await db.meeting.findUnique({
      where: { id: archivedId },
      include: { roleAssignments: { include: { user: true } } }
    });
  } else {
    // To allow the Friday meeting to remain visible until 9:00 PM, 
    // we use a buffer of 2 hours and 15 mins (8100000ms) since the DB date is 6:45 PM.
    const archivalThreshold = new Date(Date.now() - 8100000);
    nextMeeting = await db.meeting.findFirst({
      where: { date: { gte: archivalThreshold }, status: 'SCHEDULED' },
      include: { roleAssignments: { include: { user: true } } },
      orderBy: { date: 'asc' }
    });
  }

  const allMembers = await db.user.findMany({ where: { role: { in: ['MEMBER', 'ADMIN'] } } });
  
  const currentUser = allMembers.find(u => u.id === session.user.dbId);

  // The user's account was deleted/deactivated mid-session. The stale JWT
  // still says MEMBER (the edge middleware can't see the deletion), so we
  // can't rely on a redirect — evict the session client-side instead.
  if (!currentUser) {
    return <ForceSignOut />;
  }

  const userFirstName = getDisplayName(currentUser, allMembers);

  if (!nextMeeting) {
    return (
        <div className="flex-1 p-8 bg-brand-cool-grey/10 min-h-screen">
          <div className="max-w-4xl mx-auto space-y-6">
            <div className="bg-white p-8 rounded-xl shadow-md border-t-8 border-gray-300">
                <h1 className="text-4xl font-black text-gray-800 mb-2 tracking-tight">Meeting Dashboard</h1>
                <p className="text-gray-500 mb-12 border-b pb-4 flex items-center gap-2">
                    Welcome, <span className="text-brand-true-maroon font-bold">{userFirstName}</span>. View the upcoming meeting schedule below.
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

  const isToastmaster = nextMeeting.roleAssignments.find((a) => a.roleName === 'Toastmaster')?.userId === session.user.id;

  // Compute final roster in correct order
  const roleSequence = [
    "Sergeant at Arms", "Toastmaster", "Timer", "Grammarian", "Filler Word Counter", "Quizmaster",
    "Speaker 1", "Speaker 2", "Speaker 3", "Evaluator 1", "Evaluator 2", "Evaluator 3",
    "Roles For Next Meeting", "Business Meeting", "Table Topics Master", "Table Topics Evaluator 1", "Table Topics Evaluator 2"
  ];

  // Rows that always show the same people. They are labels, not assignments,
  // so they never count as the viewer's role — even if the viewer is "John".
  const fixedRows: Record<string, string> = {
    "Roles For Next Meeting": "John",
    "Business Meeting": "Andrew",
  };

  // Computed display names for all members earlier
  const agendaItems = roleSequence.map(role => {
      if (role in fixedRows) return { role, name: fixedRows[role], isViewer: false };

      const user = nextMeeting.roleAssignments.find((a) => a.roleName === role)?.user;
      return {
          role,
          name: user ? getDisplayName(user, allMembers) : "TBD",
          isViewer: user?.id === currentUser.id,
      };
  });

  const hasFinalized = nextMeeting.roleAssignments.some((a) => MINOR_ROLES.includes(a.roleName));

  // The viewer's own roles, in roster order. The Toastmaster box already
  // announces the Toastmaster role, so the banner only lists any others.
  const viewerRoles = agendaItems.filter((item) => item.isViewer).map((item) => item.role);
  const bannerRoles = isToastmaster ? viewerRoles.filter((role) => role !== 'Toastmaster') : viewerRoles;
  const showRoleBanner = hasFinalized && !archivedId;

  const meetingDetails = [
    { label: 'Date', value: nextMeeting.date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }) },
    { label: 'Theme', value: nextMeeting.theme?.trim() },
    { label: 'Question of the Day', value: nextMeeting.qotd?.trim() },
  ].filter((detail) => detail.value);

  return (
    <div className="flex-1 p-8 bg-brand-cool-grey/10 min-h-screen">
      <div className="max-w-4xl mx-auto space-y-6 pb-12">
        
        <div className="bg-white p-8 rounded-xl shadow-md border-t-8 border-brand-loyal-blue transition-all hover:shadow-lg">
            <h1 className="text-4xl font-black text-brand-loyal-blue mb-2 tracking-tight">Meeting Dashboard</h1>
            <p className="text-gray-500 mb-8 border-b pb-4 flex items-center gap-2">
                {archivedId ? (
                    <span><strong className="text-gray-800">Archive Mode</strong>: You are viewing a historical club record.</span>
                ) : (
                    <>Welcome, <span className="text-brand-true-maroon font-bold">{userFirstName}</span>. Review the operating schedule below.</>
                )}
            </p>

            {isToastmaster && !archivedId && (
            <div className="mb-12 p-6 bg-brand-happy-yellow/10 rounded-xl border-2 border-brand-happy-yellow shadow-sm animate-in fade-in slide-in-from-top-4 duration-500">
                <div className="flex gap-4">
                    <div className="bg-brand-happy-yellow text-white p-3 rounded-lg self-start shadow-md">
                        <FileText size={24} />
                    </div>
                    <div>
                        <h2 className="text-xl font-bold text-gray-800 mb-1 tracking-tight">Your Role: Toastmaster</h2>
                        <p className="text-sm text-gray-600 mb-6 max-w-md">You are the lead for the meeting on <strong className="text-brand-true-maroon">{nextMeeting.date.toLocaleDateString()}</strong>. Start the workflow below to prepare the agenda.</p>
                        <Link 
                            href={`/agenda/create${hasFinalized ? '?step=3' : ''}`} 
                            className="bg-brand-loyal-blue text-white font-bold py-3 px-8 rounded-xl shadow-lg hover:bg-brand-loyal-blue/90 transition-all inline-block hover:-translate-y-0.5 transform"
                        >
                            {hasFinalized ? 'Update Agenda' : 'Begin Meeting Prep'}
                        </Link>
                        <p className="text-xs text-gray-500 mt-4">
                            First time as Toastmaster?{' '}
                            <Link href="/tutorial#toastmaster" className="font-bold text-brand-loyal-blue hover:underline">
                                Read the guide →
                            </Link>
                        </p>
                    </div>
                </div>
            </div>
            )}
            
            {!hasFinalized ? (
                <div className="p-20 text-center text-gray-300 border-4 border-dashed rounded-2xl bg-gray-50/50 flex flex-col items-center gap-4">
                    <Calendar size={48} className="opacity-20" />
                    <div className="font-mono text-sm uppercase tracking-widest opacity-50 font-bold">Waiting for Agenda Details</div>
                    <p className="text-xs max-w-xs text-gray-400">The assigned Toastmaster hasn't finished setting up the meeting details yet.</p>
                </div>
            ) : (
                <div className="space-y-4">
                    {showRoleBanner && bannerRoles.length > 0 && (
                        <div className="mb-8 p-5 bg-brand-loyal-blue/5 rounded-xl border-2 border-brand-loyal-blue/30 flex gap-4 items-center">
                            <div className="bg-brand-loyal-blue text-white p-3 rounded-lg shadow-md">
                                <UserCheck size={24} />
                            </div>
                            <h2 className="text-xl font-bold text-gray-800 tracking-tight">
                                {`${isToastmaster ? 'Also ' : ''}Your ${bannerRoles.length > 1 ? 'Roles' : 'Role'}: `}
                                <span className="text-brand-loyal-blue">{bannerRoles.join(', ')}</span>
                            </h2>
                        </div>
                    )}
                    {showRoleBanner && viewerRoles.length === 0 && (
                        <p className="mb-8 px-4 py-3 rounded-xl border bg-gray-50 text-sm text-gray-600">
                            You don&apos;t have a role this meeting.
                        </p>
                    )}

                    <dl className="mb-8 grid gap-3 text-sm">
                        {meetingDetails.map((detail) => (
                            <div key={detail.label} className="flex flex-col sm:flex-row sm:gap-3">
                                <dt className="font-black text-gray-400 uppercase tracking-widest text-xs sm:w-44 sm:shrink-0 sm:pt-0.5">{detail.label}</dt>
                                <dd className="font-bold text-gray-800">{detail.value}</dd>
                            </div>
                        ))}
                    </dl>

                    <div className="flex items-center justify-between mb-4">
                        <h3 className="font-black text-gray-400 uppercase tracking-widest text-xs">{archivedId ? 'Historical Roster' : 'Meeting Roster'}</h3>
                        <div className={`flex items-center gap-2 text-[10px] font-bold px-2 py-0.5 rounded-full border ${archivedId ? 'text-gray-600 bg-gray-50 border-gray-200' : 'text-green-600 bg-green-50 border-green-200'}`}>
                            {!archivedId && <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />}
                            {archivedId ? 'LOCKED' : 'FINALIZED'}
                        </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {agendaItems.map((item, idx) => (
                            <div key={idx} className={`flex justify-between items-center gap-2 p-3 border rounded-xl transition-all group ${item.isViewer ? 'bg-brand-loyal-blue/10 border-brand-loyal-blue ring-1 ring-brand-loyal-blue' : 'bg-gray-50 hover:bg-white'}`}>
                                <span className={`text-sm font-bold transition-colors ${item.isViewer ? 'text-brand-loyal-blue' : 'text-gray-500 group-hover:text-brand-loyal-blue'}`}>{item.role}</span>
                                <span className="flex items-center gap-2">
                                    {item.isViewer && (
                                        <span className="text-[10px] font-black uppercase tracking-widest text-white bg-brand-true-maroon px-2 py-0.5 rounded-full">You</span>
                                    )}
                                    <span className={`text-sm font-black tracking-tight px-3 py-1 rounded-lg ${item.name === 'TBD' ? 'text-red-300 bg-red-50/50 italic' : 'text-brand-loyal-blue bg-white shadow-sm border'}`}>
                                        {item.name}
                                    </span>
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
