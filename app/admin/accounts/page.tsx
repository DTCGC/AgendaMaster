/**
 * Admin Member Management Page
 *
 * Three-panel view for managing club membership:
 *   1. Pending approvals queue (new sign-up requests)
 *   2. Active member directory (with inline name editing)
 *   3. Guest subscriber list
 * Plus the club Google account connection used by members without Google.
 */
import { pageRequireAdmin } from '@/lib/auth-guard'
import { db } from '@/lib/db'
import Link from 'next/link'
import { connectClubGoogle } from '@/app/actions/accounts'
import RemoveButton from '@/components/admin/remove-button'
import { getClubGoogleStatus, CLUB_GOOGLE_EMAIL } from '@/lib/club-google'
import { Check, Users, Mail, ShieldCheck, KeyRound, Link2 } from 'lucide-react'
import { PageShell, PageHeader, SectionLabel } from '@/components/common/page'
import { Badge, Card, EmptyState, IconDisc } from '@/components/common/surfaces'
import { Button } from '@/components/ui/button'
import EditableName from '@/components/admin/editable-name'
import AccountActionButtons from '@/components/admin/account-action-buttons'
import { formatMeetingDate } from '@/lib/meeting-time'

export const metadata = {
  title: 'Admin Approvals - DTCGC',
}

export default async function AccountsPage() {
  const session = await pageRequireAdmin()

  // Fetch pending registrations
  const pendingUsers = await db.user.findMany({
    where: { role: 'PENDING' },
    orderBy: { createdAt: 'desc' }
  })

  // Fetch active directory (Members and EXECs)
  const activeUsers = await db.user.findMany({
    where: { role: { in: ['MEMBER', 'ADMIN'] } },
    orderBy: { lastName: 'asc' }
  })

  // Fetch guest list
  const guestSubscribers = await db.subscriber.findMany({
    orderBy: { subscribedAt: 'desc' }
  })

  const clubGoogle = await getClubGoogleStatus()

  // Members who registered with email + password rather than Google. The
  // ADMIN credential also has a password but is not a member, so no badge.
  const emailLoginBadge = (user: { role: string; passwordHash: string | null }) =>
    user.role !== 'ADMIN' && user.passwordHash ? (
      <Badge tone="warning" caps title="Registered with email and password (no Google account)">
        <KeyRound size={12} /> Email login
      </Badge>
    ) : null

  return (
    <PageShell width="6xl" className="space-y-12">
        <PageHeader
          title="Member Management"
          description="Review new sign-up requests and manage member accounts."
          actions={
            <Badge tone="brand" className="px-4 py-2 text-sm">
              <Users size={16} /> {activeUsers.length} Active Accounts
            </Badge>
          }
        />

        {/* Pending Approvals */}
        <section className="space-y-4">
            <SectionLabel className="px-1">New Sign-up Requests</SectionLabel>
            {pendingUsers.length === 0 ? (
                <EmptyState icon={Check} title="No pending requests">
                    New members can sign up at <Link href="/login" className="font-semibold text-brand-loyal-blue hover:underline">/login</Link>.
                </EmptyState>
            ) : (
                <Card>
                    <div className="overflow-x-auto">
                    <table className="w-full border-collapse text-left">
                        <thead>
                        <tr className="bg-gray-50">
                            <TableHead>Requested</TableHead>
                            <TableHead>Full Name</TableHead>
                            <TableHead>Email</TableHead>
                            <TableHead className="text-right">Actions</TableHead>
                        </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                        {pendingUsers.map((user) => (
                            <tr key={user.id} className="transition-colors hover:bg-gray-50">
                            <td className="p-4 text-sm text-gray-500">{formatMeetingDate(user.createdAt)}</td>
                            <td className="p-4 font-bold text-brand-loyal-blue">
                                <div className="flex items-center gap-2">{user.firstName} {user.lastName} {emailLoginBadge(user)}</div>
                            </td>
                            <td className="p-4 text-sm text-gray-600">{user.email}</td>
                            <td className="p-4">
                                <AccountActionButtons userId={user.id} userName={`${user.firstName} ${user.lastName}`} />
                            </td>
                            </tr>
                        ))}
                        </tbody>
                    </table>
                    </div>
                </Card>
            )}
        </section>

        {/* Directory Layers */}
        <div className="grid grid-cols-1 gap-12 lg:grid-cols-2">

            {/* Active Members Directory */}
            <section className="space-y-4">
                <SectionLabel className="px-1">Active Member List</SectionLabel>
                <Card>
                    <ul className="max-h-125 divide-y divide-gray-100 overflow-y-auto">
                        {activeUsers.map((user) => (
                            <li key={user.id} className="group flex items-center justify-between gap-3 p-4 transition-colors hover:bg-gray-50">
                                <div className="flex min-w-0 items-center gap-3">
                                    <div className={`flex size-9 shrink-0 items-center justify-center rounded-full text-xs font-bold ${user.role === 'ADMIN' ? 'bg-brand-true-maroon text-white' : 'bg-brand-loyal-blue/10 text-brand-loyal-blue'}`}>
                                        {user.firstName[0]}{user.lastName[0]}
                                    </div>
                                    <div className="min-w-0">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <EditableName userId={user.id} firstName={user.firstName} lastName={user.lastName} />
                                            {user.role === 'ADMIN' && <ShieldCheck size={14} className="text-brand-true-maroon" aria-label="Administrator" />}
                                            {emailLoginBadge(user)}
                                        </div>
                                        <div className="truncate text-xs text-gray-500">{user.email}</div>
                                    </div>
                                </div>

                                {user.role !== 'ADMIN' && user.id !== session.user.dbId && (
                                    <RemoveButton kind="member" id={user.id} label={`${user.firstName} ${user.lastName}`} />
                                )}
                            </li>
                        ))}
                    </ul>
                </Card>
            </section>

            {/* Guest Subscriber Directory */}
            <section className="space-y-4">
                <SectionLabel className="px-1">Guest List</SectionLabel>
                {guestSubscribers.length === 0 ? (
                    <EmptyState icon={Mail} title="No guests yet">
                        No public guests have subscribed yet.
                    </EmptyState>
                ) : (
                    <Card>
                        <ul className="max-h-125 divide-y divide-gray-100 overflow-y-auto">
                            {guestSubscribers.map((sub) => (
                                <li key={sub.id} className="group flex items-center justify-between gap-3 p-4 transition-colors hover:bg-gray-50">
                                    <div className="flex min-w-0 items-center gap-3">
                                        <IconDisc icon={Mail} tone="neutral" size="sm" />
                                        <div className="min-w-0">
                                            <div className="truncate text-sm font-semibold text-gray-700">{sub.email}</div>
                                            <div className="text-xs text-gray-500">Enrolled: {formatMeetingDate(sub.subscribedAt)}</div>
                                        </div>
                                    </div>
                                    <RemoveButton kind="subscriber" id={sub.id} label={sub.email} />
                                </li>
                            ))}
                        </ul>
                    </Card>
                )}
            </section>

        </div>

        {/* Club Google account — used only for members without Google */}
        <section className="space-y-4">
            <SectionLabel className="px-1">Club Google Account</SectionLabel>
            <Card className="flex flex-col justify-between gap-6 p-6 md:flex-row md:items-center">
                <div className="max-w-2xl space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                        <span className={`size-2.5 rounded-full ${clubGoogle.connected ? 'bg-green-500' : 'bg-gray-300'}`} />
                        <span className="font-bold text-gray-800">
                            {clubGoogle.connected ? 'Connected' : 'Not connected'}
                        </span>
                        {clubGoogle.connectedAt && (
                            <span className="text-xs text-gray-500">since {formatMeetingDate(clubGoogle.connectedAt)}</span>
                        )}
                    </div>
                    <p className="text-sm leading-relaxed text-gray-600">
                        Members marked <strong>Email login</strong> have no Google account, so when they are Toastmaster the agenda sheet is created in — and the agenda email sent from — <strong>{CLUB_GOOGLE_EMAIL}</strong>. Google members are not affected.
                    </p>
                    <p className="text-xs leading-relaxed text-amber-800">
                        Choose <strong>{CLUB_GOOGLE_EMAIL}</strong> on the Google screen. Picking any other Google account signs you in as that account instead and connects nothing.
                    </p>
                </div>
                <form action={connectClubGoogle}>
                    <Button type="submit" variant="outline">
                        <Link2 />
                        {clubGoogle.connected ? 'Reconnect' : 'Connect'} with Google
                    </Button>
                </form>
            </Card>
        </section>
    </PageShell>
  )
}

function TableHead({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <th className={`border-b border-gray-200 p-4 text-xs font-bold uppercase tracking-widest text-gray-500 ${className ?? ''}`}>
      {children}
    </th>
  )
}
