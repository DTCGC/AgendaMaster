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
import { formatMeetingDate } from "@/lib/meeting-time";
import { redirect } from "next/navigation";
import Link from "next/link";
import AgendaWizard from "@/components/agenda/wizard";
import { AlertCircle, Calendar } from "lucide-react";
import { PageShell, PageHeader } from "@/components/common/page";
import { Badge } from "@/components/common/surfaces";
import { AuthCard, AuthPage } from "@/components/common/auth-card";
import { MeetingSelector } from "@/components/common/meeting-selector";
import { buttonVariants } from "@/components/ui/button-variants";
import { cn } from "@/lib/utils";

export const metadata = {
  title: "Agenda Creation - DTCGC",
}

const NoMeetingsCard = (
    <AuthPage>
        <AuthCard icon={Calendar} title="No Meetings Scheduled" width="md">
            <Link href="/agenda" className={cn(buttonVariants({ size: "lg" }), "w-full")}>
                Return to Dashboard
            </Link>
        </AuthCard>
    </AuthPage>
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
      <PageShell width="7xl" data-shot="wizard-page">
          <PageHeader title="Agenda Engine">
              <Badge tone="maroon" className="px-3 py-1 text-sm">
                  <Calendar size={14} /> Editing meeting on: {formatMeetingDate(currentMeeting.date)}
              </Badge>
              <Badge caps>Admin Update Mode</Badge>
          </PageHeader>

          <div className="grid grid-cols-1 gap-8 lg:grid-cols-4">
              <div className="lg:col-span-1">
                  <MeetingSelector
                      meetings={upcomingMeetings}
                      currentId={currentMeeting.id}
                      hrefFor={(id) => `?step=3&meetingId=${id}`}
                      showSheetStatus
                      note="Meetings without a generated sheet can still have roles edited here, but the sheet itself is only created by the Toastmaster's full wizard run."
                  />
              </div>

              <div className="lg:col-span-3">
                  {/* Keyed so switching meetings remounts the wizard with fresh state. */}
                  <AgendaWizard key={currentMeeting.id} meetingId={currentMeeting.id} />
              </div>
          </div>
      </PageShell>
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
  const isToastmaster = nextMeeting.roleAssignments[0]?.userId === session.user.dbId;

  if (!isToastmaster) {
    return (
      <AuthPage>
        <AuthCard icon={AlertCircle} title="Toastmaster Access Only" width="md">
          <div className="space-y-3 text-center">
            <p className="text-gray-600">You aren&apos;t listed as the Toastmaster for the meeting on <strong className="text-gray-800">{formatMeetingDate(nextMeeting.date)}</strong>.</p>
            <p className="text-sm text-gray-500">Only the assigned Toastmaster — or an administrator, through the admin login — can edit this agenda.</p>
          </div>
          <Link href="/agenda" className={cn(buttonVariants({ size: "lg" }), "mt-8 w-full")}>
            Return to Dashboard
          </Link>
        </AuthCard>
      </AuthPage>
    )
  }

  return (
    <PageShell width="5xl" data-shot="wizard-page">
      <PageHeader title="Agenda Engine">
        <Badge tone="maroon" className="px-3 py-1 text-sm">
          <Calendar size={14} /> Preparing for meeting on: {formatMeetingDate(nextMeeting.date)}
        </Badge>
      </PageHeader>

      <AgendaWizard meetingId={nextMeeting.id} />
    </PageShell>
  );
}
