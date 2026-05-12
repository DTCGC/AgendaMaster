/**
 * Admin Member Management Page
 *
 * Three-panel view for managing club membership:
 *   1. Pending approvals queue (new sign-up requests)
 *   2. Active member directory (with inline name editing)
 *   3. Guest subscriber list
 */
import { auth } from '@/auth'
import { db } from '@/lib/db'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { removeUser, removeSubscriber } from '@/app/actions/accounts'
import { Check, Users, Mail, Trash2, ShieldCheck } from 'lucide-react'
import EditableName from '@/components/admin/editable-name'
import AccountActionButtons from '@/components/admin/account-action-buttons'

export const metadata = {
  title: 'Admin Approvals - DTCGC',
}

export default async function AccountsPage() {
  const session = await auth()
  
  if (session?.user?.role !== 'ADMIN') {
    redirect('/agenda')
  }

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
                        {pendingUsers.map((user: any) => (
                            <tr key={user.id} className="hover:bg-gray-50/50 transition-colors">
                            <td className="p-4 text-sm text-gray-500">{new Date(user.createdAt).toLocaleDateString()}</td>
                            <td className="p-4 font-bold text-brand-loyal-blue">{user.firstName} {user.lastName}</td>
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
                        {activeUsers.map((user: any) => (
                            <div key={user.id} className="p-4 flex items-center justify-between group hover:bg-gray-50 transition-colors">
                                <div className="flex items-center gap-3">
                                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${user.role === 'ADMIN' ? 'bg-brand-true-maroon text-white' : 'bg-brand-loyal-blue/10 text-brand-loyal-blue'}`}>
                                        {user.firstName[0]}{user.lastName[0]}
                                    </div>
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <EditableName userId={user.id} firstName={user.firstName} lastName={user.lastName} />
                                            {user.role === 'ADMIN' && <ShieldCheck size={14} className="text-brand-true-maroon" />}
                                        </div>
                                        <div className="text-[10px] text-gray-500 font-mono italic">{user.email}</div>
                                    </div>
                                </div>
                                
                                {user.id !== session.user.id && (
                                    <form action={removeUser}>
                                        <input type="hidden" name="userId" value={user.id} />
                                        <button type="submit" className="opacity-0 group-hover:opacity-100 p-2 text-gray-300 hover:text-red-500 transition-all rounded-lg hover:bg-red-50">
                                            <Trash2 size={16} />
                                        </button>
                                    </form>
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
                            {guestSubscribers.map((sub: any) => (
                                <div key={sub.id} className="p-4 flex items-center justify-between group hover:bg-gray-50 transition-colors">
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 rounded bg-gray-100 flex items-center justify-center text-gray-400">
                                            <Mail size={14} />
                                        </div>
                                        <div>
                                            <div className="font-semibold text-sm text-gray-700">{sub.email}</div>
                                            <div className="text-[10px] text-gray-400">Enrolled: {new Date(sub.subscribedAt).toLocaleDateString()}</div>
                                        </div>
                                    </div>
                                    <form action={removeSubscriber}>
                                        <input type="hidden" name="subscriberId" value={sub.id} />
                                        <button type="submit" className="opacity-0 group-hover:opacity-100 p-2 text-gray-300 hover:text-red-500 transition-all rounded-lg hover:bg-red-50">
                                            <Trash2 size={16} />
                                        </button>
                                    </form>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>

        </div>

      </div>
    </div>
  )
}
