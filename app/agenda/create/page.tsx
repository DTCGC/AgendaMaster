/**
 * Agenda Creation Page (Toastmaster + Admin Entry Point)
 *
 * Two audiences, two shapes of access:
 *   - Toastmaster: strictly gated to the closest upcoming SCHEDULED meeting
 *     they are assigned to, full 4-step wizard. Unchanged. (A Toastmaster who
 *     registered without Google gets the same wizard; the pipeline creates
 *     and emails through the club's Google account for them.)
 *   - Admin: may edit ANY upcoming scheduled meeting (selector sidebar, same
 *     pattern as /admin/roles), always in the wizard's roster-only update
 *     mode (?step=3). Their sheet updates run through the app's service
 *     account, since credentials-login admins hold no Google OAuth token.
 * Everyone else sees a permission-denied message.
 */
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { editableMeetingsSince } from "@/lib/archival";
import { redirect } from "next/navigation";
import Link from "next/link";
import AgendaWizard from "@/components/agenda/wizard";
import { AlertCircle, Calendar, ChevronRight, FileSpreadsheet } from "lucide-react";

export const metadata = {
  title: "Agenda Creation - DTCGC",
}

const NoMeetingsCard = (
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

export default async function CreateAgendaPage({
    searchParams,
}: {
    searchParams: Promise<{ meetingId?: string; step?: string }>
}) {
  const session = await auth();
  const params = await searchParams;

  if (!session?.user) {
    redirect('/login');
  }

  // --- ADMIN: pick any upcoming meeting, always in update mode ---
  if (session.user.role === 'ADMIN') {
    // Admins never author the email or settings — their entry is always the
    // wizard's roster-only update mode. Forcing ?step=3 here (rather than
    // trusting the link that got them in) keeps a hand-typed URL from
    // landing an admin in the full create-and-email flow.
    if (params.step !== '3') {
      redirect(`/agenda/create?step=3${params.meetingId ? `&meetingId=${params.meetingId}` : ''}`);
    }

    const upcomingMeetings = await db.meeting.findMany({
      where: { date: { gte: editableMeetingsSince() }, status: 'SCHEDULED' },
      orderBy: { date: 'asc' },
      take: 10
    });

    const currentMeeting =
      upcomingMeetings.find((m) => m.id === params.meetingId) || upcomingMeetings[0];

    if (!currentMeeting) {
      return NoMeetingsCard;
    }

    return (
      <div className="flex-1 p-8 bg-brand-cool-grey/10 min-h-screen">
        <div className="max-w-7xl mx-auto">
          <div className="mb-8 border-b pb-6">
              <h1 className="text-4xl font-extrabold text-brand-loyal-blue tracking-tight">Agenda Engine</h1>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                  <div className="flex items-center gap-2 text-brand-true-maroon font-bold text-sm bg-brand-true-maroon/5 w-fit px-3 py-1 rounded-full border border-brand-true-maroon/20">
                      <Calendar size={14} /> Editing meeting on: {currentMeeting.date.toLocaleDateString()}
                  </div>
                  <div className="flex items-center gap-2 text-gray-500 font-bold text-xs bg-gray-100 w-fit px-3 py-1 rounded-full border border-gray-200 uppercase tracking-tight">
                      Admin Update Mode
                  </div>
              </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
              {/* Meeting Selector Sidebar — same pattern as /admin/roles */}
              <div className="lg:col-span-1 space-y-4">
                  <h3 className="text-sm font-bold text-gray-400 uppercase tracking-widest px-2">Upcoming Meetings</h3>
                  <div className="space-y-2">
                      {upcomingMeetings.map((meeting) => (
                          <a
                              key={meeting.id}
                              href={`?step=3&meetingId=${meeting.id}`}
                              className={`block p-4 rounded-xl border transition-all ${meeting.id === currentMeeting.id ? 'bg-brand-true-maroon text-white border-brand-true-maroon shadow-md' : 'bg-white hover:bg-gray-50 text-gray-700 border-gray-200'}`}
                          >
                              <div className="flex justify-between items-center">
                                  <div className="space-y-1">
                                      <div className="font-black text-lg">
                                          {new Date(meeting.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                      </div>
                                      <div className={`text-xs ${meeting.id === currentMeeting.id ? 'text-white/70' : 'text-gray-500'}`}>
                                          {meeting.theme || "TBD Theme"}
                                      </div>
                                      <div className={`flex items-center gap-1 text-[10px] font-bold uppercase tracking-tight ${meeting.googleSheetId ? (meeting.id === currentMeeting.id ? 'text-white/80' : 'text-green-700') : (meeting.id === currentMeeting.id ? 'text-white/60' : 'text-gray-400')}`}>
                                          <FileSpreadsheet size={11} />
                                          {meeting.googleSheetId ? 'Sheet generated' : 'No sheet yet'}
                                      </div>
                                  </div>
                                  <ChevronRight size={18} className={meeting.id === currentMeeting.id ? 'text-white' : 'text-gray-300'} />
                              </div>
                          </a>
                      ))}
                  </div>
                  <p className="text-[11px] text-gray-400 leading-snug px-2">
                      Meetings without a generated sheet can still have roles edited here, but the
                      sheet itself is only created by the Toastmaster&apos;s full wizard run.
                  </p>
              </div>

              <div className="lg:col-span-3">
                  {/* Keyed so switching meetings remounts the wizard with fresh state. */}
                  <AgendaWizard key={currentMeeting.id} meetingId={currentMeeting.id} />
              </div>
          </div>
        </div>
      </div>
    );
  }

  // --- MEMBER: the assigned Toastmaster's full wizard (unchanged) ---

  // Find the closest upcoming SCHEDULED meeting
  const nextMeeting = await db.meeting.findFirst({
    where: {
        date: { gte: editableMeetingsSince() },
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
    return NoMeetingsCard;
  }

  // Authorization: STRICTLY enforced Toastmaster-only access (admins were
  // routed to their own selector view above).
  const isToastmaster = nextMeeting.roleAssignments[0]?.userId === session.user.id;

  if (!isToastmaster) {
    return (
        <div className="flex-1 p-8 bg-brand-cool-grey/10 min-h-screen flex items-center justify-center">
            <div className="max-w-md bg-white p-8 rounded-xl shadow-lg border border-red-100 text-center space-y-4">
                <AlertCircle size={48} className="mx-auto text-red-500" />
                <h2 className="text-2xl font-bold text-gray-800">Toastmaster Access Only</h2>
                <p className="text-gray-600 font-medium">You aren&apos;t listed as the Toastmaster for the meeting on <strong>{nextMeeting.date.toLocaleDateString()}</strong>.</p>
                <p className="text-xs text-gray-400">Only the assigned Toastmaster — or an administrator, through the admin login — can edit this agenda.</p>
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
