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
import { MINOR_ROLES, FIXED_ROLES, ROSTER_ORDER } from '@/lib/roles';
import { visibleMeetingsSince } from '@/lib/archival';
import { formatMeetingDate, formatMeetingDateLong } from '@/lib/meeting-time';
import ForceSignOut from '@/components/auth/force-sign-out';
import { PageShell, SectionLabel } from '@/components/common/page';
import { Badge, EmptyState, IconDisc, StatusPill } from '@/components/common/surfaces';
import { buttonVariants } from '@/components/ui/button-variants';
import { cn } from '@/lib/utils';

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
    // The meeting stays visible until its 9:00 PM archival (lib/archival.ts).
    nextMeeting = await db.meeting.findFirst({
      where: { date: { gte: visibleMeetingsSince() }, status: 'SCHEDULED' },
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
      <PageShell width="4xl">
        <DashboardCard>
          <DashboardHeader>
            Welcome, <strong className="font-bold text-brand-true-maroon">{userFirstName}</strong>. View the upcoming meeting schedule below.
          </DashboardHeader>
          <EmptyState icon={Calendar} title="No Meetings Scheduled">
            The club calendar is currently clear. Admins will update the schedule for the next academic cycle shortly.
          </EmptyState>
        </DashboardCard>
      </PageShell>
    );
  }

  const isToastmaster = nextMeeting.roleAssignments.find((a) => a.roleName === 'Toastmaster')?.userId === currentUser.id;

  // Roster in meeting order. Fixed rows always show the same people; they are
  // labels, not assignments, so they never count as the viewer's role — even
  // if the viewer is "John".
  const agendaItems = ROSTER_ORDER.map(role => {
      if (role in FIXED_ROLES) return { role, name: FIXED_ROLES[role], isViewer: false };

      const user = nextMeeting.roleAssignments.find((a) => a.roleName === role)?.user;
      return {
          role,
          name: user ? getDisplayName(user, allMembers) : "TBD",
          isViewer: user?.id === currentUser.id,
      };
  });

  const hasFinalized = nextMeeting.roleAssignments.some((a) => MINOR_ROLES.includes(a.roleName));
  // Update mode (?step=3) only syncs an existing sheet. Until the sheet exists
  // — e.g. Step 4 saved the roles but the sheet or email failed — the
  // Toastmaster goes back through the full wizard, which creates and sends it.
  const hasSheet = !!nextMeeting.googleSheetId;

  // The viewer's own roles, in roster order. The Toastmaster box already
  // announces the Toastmaster role, so the banner only lists any others.
  const viewerRoles = agendaItems.filter((item) => item.isViewer).map((item) => item.role);
  const bannerRoles = isToastmaster ? viewerRoles.filter((role) => role !== 'Toastmaster') : viewerRoles;
  const showRoleBanner = hasFinalized && !archivedId;

  const meetingDetails = [
    { label: 'Date', value: formatMeetingDateLong(nextMeeting.date) },
    { label: 'Theme', value: nextMeeting.theme?.trim() },
    { label: 'Question of the Day', value: nextMeeting.qotd?.trim() },
  ].filter((detail) => detail.value);

  return (
    <PageShell width="4xl">
      <DashboardCard>
        <DashboardHeader>
          {archivedId ? (
            <><strong className="font-bold text-gray-800">Archive Mode:</strong> You are viewing a historical club record.</>
          ) : (
            <>Welcome, <strong className="font-bold text-brand-true-maroon">{userFirstName}</strong>. Review the operating schedule below.</>
          )}
        </DashboardHeader>

        {isToastmaster && !archivedId && (
          <div className="mb-10 flex gap-4 rounded-xl border-2 border-brand-happy-yellow bg-brand-happy-yellow/15 p-6">
            <IconDisc icon={FileText} tone="yellow" rounded="xl" />
            <div>
              <h2 className="mb-1 text-xl font-bold tracking-tight text-gray-800">Your Role: Toastmaster</h2>
              <p className="mb-6 max-w-md text-sm leading-relaxed text-gray-600">
                You are the lead for the meeting on <strong className="text-brand-true-maroon">{formatMeetingDate(nextMeeting.date)}</strong>. Start the workflow below to prepare the agenda.
              </p>
              <Link href={`/agenda/create${hasSheet ? '?step=3' : ''}`} className={cn(buttonVariants({ size: "lg" }), "shadow-md")}>
                {hasSheet ? 'Update Agenda' : hasFinalized ? 'Finish Meeting Prep' : 'Begin Meeting Prep'}
              </Link>
              <p className="mt-4 text-xs text-gray-500">
                First time as Toastmaster?{' '}
                <Link href="/tutorial#toastmaster" className="font-bold text-brand-loyal-blue hover:underline">
                  Read the guide →
                </Link>
              </p>
            </div>
          </div>
        )}

        {!hasFinalized ? (
          <EmptyState icon={Calendar} title="Waiting for Agenda Details">
            The assigned Toastmaster hasn&apos;t finished setting up the meeting details yet.
          </EmptyState>
        ) : (
          <div className="space-y-8">
            {showRoleBanner && bannerRoles.length > 0 && (
              <div className="flex items-center gap-4 rounded-xl border-2 border-brand-loyal-blue/30 bg-brand-loyal-blue/5 p-5">
                <IconDisc icon={UserCheck} tone="brand-solid" rounded="xl" />
                <h2 className="text-xl font-bold tracking-tight text-gray-800">
                  {`${isToastmaster ? 'Also ' : ''}Your ${bannerRoles.length > 1 ? 'Roles' : 'Role'}: `}
                  <span className="text-brand-loyal-blue">{bannerRoles.join(', ')}</span>
                </h2>
              </div>
            )}
            {showRoleBanner && viewerRoles.length === 0 && (
              <p className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-600">
                You don&apos;t have a role this meeting.
              </p>
            )}

            <dl className="grid gap-3 text-sm">
              {meetingDetails.map((detail) => (
                <div key={detail.label} className="flex flex-col gap-1 sm:flex-row sm:gap-3">
                  <SectionLabel as="dt" className="sm:w-44 sm:shrink-0 sm:pt-0.5">{detail.label}</SectionLabel>
                  <dd className="font-bold text-gray-800">{detail.value}</dd>
                </div>
              ))}
            </dl>

            <div>
              <div className="mb-4 flex items-center justify-between">
                <SectionLabel as="h3">{archivedId ? 'Historical Roster' : 'Meeting Roster'}</SectionLabel>
                <StatusPill status={archivedId ? 'LOCKED' : 'FINALIZED'} />
              </div>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {agendaItems.map((item) => (
                  <div
                    key={item.role}
                    data-shot="roster-row"
                    className={cn(
                      "group flex items-center justify-between gap-2 rounded-xl border p-3 transition-colors",
                      item.isViewer
                        ? "border-brand-loyal-blue bg-brand-loyal-blue/10 ring-1 ring-brand-loyal-blue"
                        : "border-gray-200 bg-gray-50 hover:bg-white"
                    )}
                  >
                    <span className={cn("text-sm font-bold", item.isViewer ? "text-brand-loyal-blue" : "text-gray-600")}>{item.role}</span>
                    <span className="flex items-center gap-2">
                      {item.isViewer && <Badge tone="maroon-solid" caps>You</Badge>}
                      <span
                        className={cn(
                          "rounded-lg px-3 py-1 text-sm tracking-tight",
                          item.name === 'TBD'
                            ? "bg-red-50 font-bold text-red-500 italic"
                            : "border border-gray-200 bg-white font-black text-brand-loyal-blue shadow-sm"
                        )}
                      >
                        {item.name}
                      </span>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </DashboardCard>
    </PageShell>
  );
}

/** The dashboard's single white card, with the club-blue top edge. */
function DashboardCard({ children }: { children: React.ReactNode }) {
  return (
    <div data-shot="dashboard-card" className="rounded-2xl border border-t-8 border-gray-200 border-t-brand-loyal-blue bg-white p-6 shadow-md md:p-8">
      {children}
    </div>
  );
}

function DashboardHeader({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-8 border-b border-gray-200 pb-6">
      <h1 className="text-3xl font-black tracking-tight text-brand-loyal-blue md:text-4xl">Meeting Dashboard</h1>
      <p className="mt-2 text-gray-600">{children}</p>
    </div>
  );
}
