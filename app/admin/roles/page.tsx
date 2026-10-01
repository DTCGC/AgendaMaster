/**
 * Admin Role Assignment Page
 *
 * Split-panel interface for assigning major roles (Toastmaster, Speakers, etc.)
 * to upcoming meetings. Left sidebar shows a meeting selector; right panel
 * shows the role form and a participation history tracker (sorted by recency).
 */
import { pageRequireAdmin } from '@/lib/auth-guard'
import { db } from '@/lib/db'
import { editableMeetingsSince } from '@/lib/archival'
import RolesForm from './roles-form'
import { MAJOR_ROLES, BACKUP_SPEAKER } from '@/lib/roles'
import Link from 'next/link'
import { Calendar as CalendarIcon, History } from 'lucide-react'
import { PageShell, PageHeader, SectionLabel } from '@/components/common/page'
import { Badge, Card, CardHeader, EmptyState, IconDisc } from '@/components/common/surfaces'
import { MeetingSelector } from '@/components/common/meeting-selector'
import { buttonVariants } from '@/components/ui/button-variants'
import { formatMeetingDateLong } from '@/lib/meeting-time'

type RoleAssignment = {
    userId: string | null;
    roleName: string;
}

export const metadata = {
  title: 'Role Management - DTCGC',
}

/** Whole days between `date` and now. */
function daysSince(date: Date): number {
  return Math.floor((Date.now() - date.getTime()) / (1000 * 3600 * 24))
}

export default async function RolesPage({
    searchParams,
}: {
    searchParams: Promise<{ meetingId?: string }>
}) {
  await pageRequireAdmin()
  const params = await searchParams;

  // Fetch upcoming scheduled meetings (next 10)
  const upcomingMeetings = await db.meeting.findMany({
    where: { date: { gte: editableMeetingsSince() }, status: 'SCHEDULED' },
    orderBy: { date: 'asc' },
    include: { roleAssignments: true },
    take: 10
  })

  // Determine which meeting we are currently editing
  const targetMeetingId = params.meetingId || upcomingMeetings[0]?.id;
  const currentMeeting = upcomingMeetings.find((m) => m.id === targetMeetingId) || upcomingMeetings[0];

  // Who was on standby most recently before this meeting? If all three speakers
  // turned up, that person never spoke and is owed a real speaking slot — this
  // surfaces the reminder at the exact moment the admin is handing out roles.
  const previousBackup = currentMeeting
    ? await db.roleAssignment.findFirst({
        where: {
          roleName: BACKUP_SPEAKER,
          userId: { not: null },
          meeting: { date: { lt: currentMeeting.date } }
        },
        orderBy: { meeting: { date: 'desc' } },
        include: { user: true, meeting: true }
      })
    : null;

  // Grab active roster, each with their most recent real role. Standby duty
  // is not participation (lib/roles.ts BACKUP_SPEAKER), the same rule the
  // auto-assignment engine sorts by.
  const members = await db.user.findMany({
    where: { role: 'MEMBER' },
    include: {
        roleAssignments: {
            where: { roleName: { not: BACKUP_SPEAKER } },
            orderBy: { assignedAt: 'desc' },
            take: 1
        }
    }
  })
  const lastActive = (m: (typeof members)[number]) => m.roleAssignments[0]?.assignedAt.getTime() ?? 0
  const byPriority = [...members].sort((a, b) => lastActive(a) - lastActive(b))

  return (
    <PageShell width="6xl">
        <PageHeader
          title="Assign Major Roles"
          description="Assign key roles (like Toastmaster) for any upcoming meetings."
        />

        {upcomingMeetings.length === 0 ? (
            <EmptyState
              icon={CalendarIcon}
              title="No Scheduled Meetings Found"
              action={<Link href="/admin/calendar" className={buttonVariants({ variant: "outline" })}>Open the Calendar</Link>}
            >
              Please schedule a meeting in the Master Calendar first.
            </EmptyState>
        ) : (
            <div className="grid grid-cols-1 gap-8 lg:grid-cols-4">
                <div className="lg:col-span-1">
                    <MeetingSelector
                      meetings={upcomingMeetings}
                      currentId={currentMeeting.id}
                      hrefFor={(id) => `?meetingId=${id}`}
                    />
                </div>

                <div className="grid grid-cols-1 gap-8 md:grid-cols-2 lg:col-span-3">
                    <div className="space-y-6">
                        <Card className="flex items-center justify-between p-6">
                            <div>
                                <SectionLabel as="p" className="text-brand-true-maroon">Currently Editing</SectionLabel>
                                <h2 className="mt-1 text-xl font-black text-gray-800">
                                    {formatMeetingDateLong(currentMeeting.date)}
                                </h2>
                            </div>
                            <IconDisc icon={CalendarIcon} tone="maroon" />
                        </Card>

                        <RolesForm
                            meetingId={currentMeeting.id}
                            initialAssignments={currentMeeting.roleAssignments
                                // Panel-owned roles only — minor roles belong to the Agenda
                                // Wizard. Seeding the form with them would round-trip them
                                // back through saveAllMajorRoles and re-stamp their
                                // assignedAt (see lib/roles-logic.ts).
                                .filter((curr: RoleAssignment) =>
                                    MAJOR_ROLES.includes(curr.roleName) || curr.roleName === BACKUP_SPEAKER)
                                .reduce((acc: Record<string, string>, curr: RoleAssignment) => {
                                    acc[curr.roleName] = curr.userId || ""
                                    return acc
                                }, {})}
                            members={members.map((u) => ({
                                id: u.id,
                                firstName: u.firstName,
                                lastName: u.lastName,
                                roleAssignments: u.roleAssignments.map((ra) => ({ assignedAt: ra.assignedAt }))
                            }))}
                            previousBackup={previousBackup?.user ? {
                                name: `${previousBackup.user.firstName} ${previousBackup.user.lastName}`,
                                meetingDate: previousBackup.meeting.date.toISOString()
                            } : null}
                            initialGuestSpeakerName={currentMeeting.guestSpeakerName ?? ''}
                        />
                    </div>

                    <Card>
                        <CardHeader icon={History}>Participation History</CardHeader>
                        <div className="p-6">
                            <p className="mb-4 border-b border-gray-200 pb-4 text-sm leading-relaxed text-gray-600">
                                Members who haven&apos;t had a role in a while are prioritized, so the top of the list is the most available.
                            </p>
                            <ul className="max-h-150 space-y-2 overflow-y-auto pr-2">
                                {byPriority.map((member) => (
                                    <li key={member.id} className="flex items-center justify-between rounded-xl border border-gray-200 p-3 text-sm transition-colors hover:bg-gray-50">
                                        <span className="font-semibold text-gray-800">{member.firstName} {member.lastName}</span>
                                        {member.roleAssignments[0] ? (
                                            <span className="text-xs text-gray-500 tabular-nums">
                                                {daysSince(member.roleAssignments[0].assignedAt)}d ago
                                            </span>
                                        ) : (
                                            <Badge tone="brand">Priority</Badge>
                                        )}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    </Card>
                </div>
            </div>
        )}
    </PageShell>
  )
}
