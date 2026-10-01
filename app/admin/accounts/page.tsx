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
import { Check, Users, Mail, Trash2, ShieldCheck, KeyRound, Link2 } from 'lucide-react'
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
      <span title="Registered with email and password (no Google account)" className="inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5">
        <KeyRound size={10} /> Email login
      </span>
    ) : null

  return (
    <div className="flex-1 p-8 bg-brand-cool-grey/10 min-h-screen">
      <div className="max-w-6xl mx-auto space-y-12">
        
        <div className="flex justify-between items-end border-b pb-4">
          <div>
            <h1 className="text-3xl font-extrabold text-brand-loyal-blue tracking-tight hover:scale-[1.01] transition-transform origin-left cursor-default">Member Management</h1>
            <p className="text-gray-600">Review new sign-up requests and manage member accounts.</p>
          </div>
          <div className="flex items-center gap-2 bg-white px-4 py-2 rounded shadow-sm border text-sm font-semibold text-brand-loyal-blue">
            <Users size={18} />
            {activeUsers.length} Active Accounts
          </div>
        </div>

        {/* Pending Approvals */}
        <div className="space-y-4">
            <h2 className="text-sm font-bold text-gray-400 uppercase tracking-widest px-2">New Sign-up Requests</h2>
            <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
                {pendingUsers.length === 0 ? (
                    <div className="p-12 text-center text-gray-400 flex flex-col items-center">
                        <Check size={40} className="mb-4 text-green-200" />
                        <p className="font-medium text-gray-500 text-lg">No pending requests</p>
                        <p className="text-sm mt-1">New members can sign up at <Link href="/login" className="text-brand-loyal-blue font-semibold hover:underline decoration-brand-true-maroon">/login</Link>.</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                        <tr className="bg-gray-50 text-gray-500 text-[10px] uppercase font-bold tracking-widest">
                            <th className="p-4 border-b">Requested</th>
                            <th className="p-4 border-b">Full Name</th>
                            <th className="p-4 border-b">Email</th>
                            <th className="p-4 border-b text-right">Actions</th>
                        </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                        {pendingUsers.map((user) => (
                            <tr key={user.id} className="hover:bg-gray-50/50 transition-colors">
                            <td className="p-4 text-sm text-gray-500">{formatMeetingDate(user.createdAt)}</td>
                            <td className="p-4 font-bold text-brand-loyal-blue">
                                <div className="flex items-center gap-2">{user.firstName} {user.lastName} {emailLoginBadge(user)}</div>
                            </td>
                            <td className="p-4 text-sm text-gray-600 italic font-mono">{user.email}</td>
                            <td className="p-4">
                                <AccountActionButtons userId={user.id} userName={`${user.firstName} ${user.lastName}`} />
                            </td>
                            </tr>
                        ))}
                        </tbody>
                    </table>
                    </div>
                )}
            </div>
        </div>

        {/* Directory Layers */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
            
            {/* Active Members Directory */}
            <div className="space-y-4">
                <h2 className="text-sm font-bold text-gray-400 uppercase tracking-widest px-2">Active Member List</h2>
                <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
                    <div className="divide-y divide-gray-100 max-h-[500px] overflow-y-auto">
                        {activeUsers.map((user) => (
                            <div key={user.id} className="p-4 flex items-center justify-between group hover:bg-gray-50 transition-colors">
                                <div className="flex items-center gap-3">
                                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${user.role === 'ADMIN' ? 'bg-brand-true-maroon text-white' : 'bg-brand-loyal-blue/10 text-brand-loyal-blue'}`}>
                                        {user.firstName[0]}{user.lastName[0]}
                                    </div>
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <EditableName userId={user.id} firstName={user.firstName} lastName={user.lastName} />
                                            {user.role === 'ADMIN' && <ShieldCheck size={14} className="text-brand-true-maroon" />}
                                            {emailLoginBadge(user)}
                                        </div>
                                        <div className="text-[10px] text-gray-500 font-mono italic">{user.email}</div>
                                    </div>
                                </div>
                                
                                {user.id !== session.user.id && (
                                    <RemoveButton kind="member" id={user.id} label={`${user.firstName} ${user.lastName}`} />
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* Guest Subscriber Directory */}
            <div className="space-y-4">
                <h2 className="text-sm font-bold text-gray-400 uppercase tracking-widest px-2">Guest List</h2>
                <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
                    {guestSubscribers.length === 0 ? (
                        <div className="p-12 text-center text-gray-400 text-sm italic">
                            No public guests have subscribed yet.
                        </div>
                    ) : (
                        <div className="divide-y divide-gray-100 max-h-[500px] overflow-y-auto">
                            {guestSubscribers.map((sub) => (
                                <div key={sub.id} className="p-4 flex items-center justify-between group hover:bg-gray-50 transition-colors">
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 rounded bg-gray-100 flex items-center justify-center text-gray-400">
                                            <Mail size={14} />
                                        </div>
                                        <div>
                                            <div className="font-semibold text-sm text-gray-700">{sub.email}</div>
                                            <div className="text-[10px] text-gray-400">Enrolled: {formatMeetingDate(sub.subscribedAt)}</div>
                                        </div>
                                    </div>
                                    <RemoveButton kind="subscriber" id={sub.id} label={sub.email} />
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>

        </div>

        {/* Club Google account — used only for members without Google */}
        <div className="space-y-4">
            <h2 className="text-sm font-bold text-gray-400 uppercase tracking-widest px-2">Club Google Account</h2>
            <div className="bg-white rounded-xl shadow-sm border p-6 flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div className="space-y-2 max-w-2xl">
                    <div className="flex items-center gap-2">
                        <span className={`w-2.5 h-2.5 rounded-full ${clubGoogle.connected ? 'bg-green-500' : 'bg-gray-300'}`} />
                        <span className="font-bold text-gray-800">
                            {clubGoogle.connected ? 'Connected' : 'Not connected'}
                        </span>
                        {clubGoogle.connectedAt && (
                            <span className="text-xs text-gray-400">since {formatMeetingDate(clubGoogle.connectedAt)}</span>
                        )}
                    </div>
                    <p className="text-sm text-gray-600">
                        Members marked <strong>Email login</strong> have no Google account, so when they are Toastmaster the agenda sheet is created in — and the agenda email sent from — <span className="font-mono">{CLUB_GOOGLE_EMAIL}</span>. Google members are not affected.
                    </p>
                    <p className="text-xs text-amber-700">
                        Choose <span className="font-mono">{CLUB_GOOGLE_EMAIL}</span> on the Google screen. Picking any other Google account signs you in as that account instead and connects nothing.
                    </p>
                </div>
                <form action={connectClubGoogle}>
                    <button type="submit" className="flex items-center gap-2 whitespace-nowrap bg-white border-2 border-brand-loyal-blue text-brand-loyal-blue font-bold rounded-xl px-4 py-2.5 hover:bg-brand-loyal-blue hover:text-white transition-all text-sm">
                        <Link2 size={16} />
                        {clubGoogle.connected ? 'Reconnect' : 'Connect'} with Google
                    </button>
                </form>
            </div>
        </div>

      </div>
    </div>
  )
}
