/**
 * Admin Master Calendar Page
 *
 * Displays upcoming Fridays for scheduling meetings and a historical
 * archive of past meetings. Admins can toggle meetings between
 * SCHEDULED / CANCELLED states and view archived meeting records.
 */
import { pageRequireAdmin } from '@/lib/auth-guard'
import { db } from '@/lib/db'
import { upcomingMeetingStarts, toYmd } from '@/lib/meeting-schedule'
import { visibleMeetingsSince } from '@/lib/archival'
import { formatMeetingDateLong } from '@/lib/meeting-time'
import MeetingToggle from '@/components/admin/meeting-toggle'
import { Clock, FileText } from 'lucide-react'
import { PageShell, PageHeader, SectionLabel } from '@/components/common/page'
import { Card, Notice, StatusPill } from '@/components/common/surfaces'
import { buttonVariants } from '@/components/ui/button-variants'
import { cn } from '@/lib/utils'
import Link from 'next/link'

export const metadata = {
  title: 'Master Calendar - DTCGC',
}

export default async function CalendarPage() {
  await pageRequireAdmin()

  const existingMeetings = await db.meeting.findMany()

  // The Fridays an admin can schedule (lib/meeting-schedule.ts)
  const potentialFridays = upcomingMeetingStarts()

  // Past = archived, or past its 9:00 PM archival time (lib/archival.ts)
  const archivalThreshold = visibleMeetingsSince();
  const pastMeetings = existingMeetings
    .filter((m) => m.status === 'ARCHIVED' || m.date < archivalThreshold)
    .sort((a, b) => b.date.getTime() - a.date.getTime());

  return (
    <PageShell width="4xl" className="space-y-8">
        <PageHeader
          title="Academic Calendar"
          description="Schedule meetings for upcoming Fridays. (Jul/Aug automatically omitted)"
        />

        <Card>
            <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left">
                <thead>
                    <tr className="bg-gray-50">
                        <TableHead>Meeting Date</TableHead>
                        <TableHead className="text-center">Status</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                    </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                    {potentialFridays.map(date => {
                        const existing = existingMeetings.find((m) =>
                            m.date.toDateString() === date.toDateString() && m.status !== 'ARCHIVED'
                        );
                        const cancelled = existing?.status === 'CANCELLED';

                        return (
                            <tr key={date.toISOString()} className={cn("transition-colors hover:bg-gray-50", cancelled && "bg-gray-50/60")}>
                                <td className="p-4">
                                    <div className={cn("font-bold", cancelled ? "text-gray-500 line-through decoration-gray-300" : "text-brand-loyal-blue")}>
                                        {formatMeetingDateLong(date)}
                                    </div>
                                    <div className="flex items-center gap-1 text-xs text-gray-500">
                                        <Clock size={12} /> Standard 6:45 PM Start
                                    </div>
                                </td>
                                <td className="p-4 text-center">
                                    <StatusPill status={existing?.status ?? 'UNSCHEDULED'} />
                                </td>
                                <td className="p-4">
                                    <div className="flex justify-end">
                                        <MeetingToggle
                                            ymd={toYmd(date)}
                                            meetingId={existing?.id}
                                            scheduled={existing?.status === 'SCHEDULED'}
                                            label={formatMeetingDateLong(date)}
                                        />
                                    </div>
                                </td>
                            </tr>
                        )
                    })}
                </tbody>
            </table>
            </div>
        </Card>

        <Notice tone="brand" title="Manual Overrides">
            <p>As per school district variations, breaks (Winter/Spring) must be manually &quot;Disabled&quot; above. Once a meeting is disabled, the Agenda Engine will skip it and target the next active Friday automatically.</p>
        </Notice>

        <section className="space-y-4 pt-4">
            <SectionLabel className="px-1">Meeting Archive</SectionLabel>
            <Card>
                <div className="overflow-x-auto">
                <table className="w-full border-collapse text-left">
                    <thead>
                        <tr className="bg-gray-50">
                            <TableHead>Meeting Date</TableHead>
                            <TableHead className="text-center">Status</TableHead>
                            <TableHead className="text-right">Records</TableHead>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {pastMeetings.length === 0 ? (
                            <tr><td colSpan={3} className="p-8 text-center text-sm text-gray-500">No past meetings recorded.</td></tr>
                        ) : pastMeetings.map((m) => (
                            <tr key={m.id} className="transition-colors hover:bg-gray-50">
                                <td className="p-4">
                                    <div className="font-bold text-gray-700">
                                        {formatMeetingDateLong(m.date)}
                                    </div>
                                    <div className="text-xs text-gray-500">Scheduled Time: 6:45 PM</div>
                                </td>
                                <td className="p-4 text-center">
                                    <StatusPill status={m.status} />
                                </td>
                                <td className="p-4">
                                    <div className="flex justify-end">
                                    {m.status !== 'CANCELLED' && (
                                        <Link href={`/agenda?archivedId=${m.id}`} className={buttonVariants({ variant: "outline", size: "sm" })}>
                                            <FileText /> View Records
                                        </Link>
                                    )}
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                </div>
            </Card>
        </section>
    </PageShell>
  )
}

function TableHead({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <th className={cn("border-b border-gray-200 p-4 text-xs font-bold uppercase tracking-widest text-gray-500", className)}>
      {children}
    </th>
  )
}
