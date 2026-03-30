import { auth } from '@/auth'
import { db } from '@/lib/db'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { approveAccount, rejectAccount, seedMockMembers, removeUser, removeSubscriber } from '@/app/actions/accounts'
import { Check, X, Users, Mail, Trash2, ShieldCheck } from 'lucide-react'

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
            <h1 className="text-3xl font-extrabold text-brand-loyal-blue tracking-tight hover:scale-[1.01] transition-transform origin-left cursor-default">Access Control</h1>
            <p className="text-gray-600">Review pending registrations and moderate portal scope.</p>
          </div>
          <div className="flex items-center gap-2 bg-white px-4 py-2 rounded shadow-sm border text-sm font-semibold text-brand-loyal-blue">
            <Users size={18} />
            {activeUsers.length} Active Accounts
          </div>
        </div>

        {/* Pending Approvals */}
        <div className="space-y-4">
            <h2 className="text-sm font-bold text-gray-400 uppercase tracking-widest px-2">Pending Request Queue</h2>
            <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
                {pendingUsers.length === 0 ? (
                    <div className="p-12 text-center text-gray-400 flex flex-col items-center">
                        <Check size={40} className="mb-4 text-green-200" />
                        <p className="font-medium text-gray-500 text-lg">Queue Clear</p>
                        <p className="text-sm mt-1">Direct recruits to <Link href="/login" className="text-brand-loyal-blue font-semibold hover:underline decoration-brand-true-maroon">/login</Link> to apply.</p>
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
                                <div className="flex gap-2 justify-end">
                                    <form action={approveAccount.bind(null, user.id)}>
                                    <button className="bg-green-600 text-white px-4 py-2 rounded shadow-sm hover:bg-green-700 transition-colors text-xs font-bold flex items-center gap-1">
                                        <Check size={14} /> Approve
                                    </button>
                                    </form>
                                    <form action={rejectAccount.bind(null, user.id)}>
                                    <button className="border border-red-200 text-red-600 px-4 py-2 rounded hover:bg-red-50 transition-colors text-xs font-bold flex items-center gap-1">
                                        <X size={14} /> Deny
                                    </button>
                                    </form>
                                </div>
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
                <h2 className="text-sm font-bold text-gray-400 uppercase tracking-widest px-2">Approved Club Roster</h2>
                <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
                    <div className="divide-y divide-gray-100 max-h-[500px] overflow-y-auto">
                        {activeUsers.map((user: any) => (
                            <div key={user.id} className="p-4 flex items-center justify-between group hover:bg-gray-50 transition-colors">
                                <div className="flex items-center gap-3">
                                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${user.role === 'ADMIN' ? 'bg-brand-true-maroon text-white' : 'bg-brand-loyal-blue/10 text-brand-loyal-blue'}`}>
                                        {user.firstName[0]}{user.lastName[0]}
                                    </div>
                                    <div>
                                        <div className="font-bold text-sm text-gray-800 flex items-center gap-2">
                                            {user.firstName} {user.lastName}
                                            {user.role === 'ADMIN' && <ShieldCheck size={14} className="text-brand-true-maroon" />}
                                        </div>
                                        <div className="text-[10px] text-gray-500 font-mono italic">{user.email}</div>
                                    </div>
                                </div>
                                
                                {user.id !== session.user.id && (
                                    <form action={removeUser.bind(null, user.id)}>
                                        <button className="opacity-0 group-hover:opacity-100 p-2 text-gray-300 hover:text-red-500 transition-all rounded-lg hover:bg-red-50">
                                            <Trash2 size={16} />
                                        </button>
                                    </form>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
                
                {/* Seed Logic */}
                {activeUsers.length < 5 && (
                    <form action={async () => { await seedMockMembers(); }} className="pt-2">
                        <button className="text-[10px] uppercase font-bold text-yellow-700 bg-brand-happy-yellow/20 px-4 py-2 border border-brand-happy-yellow rounded hover:bg-yellow-100 transition-colors">
                            Populate Mock Roster (12 Individuals)
                        </button>
                    </form>
                )}
            </div>

            {/* Guest Subscriber Directory */}
            <div className="space-y-4">
                <h2 className="text-sm font-bold text-gray-400 uppercase tracking-widest px-2">Public Mailing List</h2>
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
                                    <form action={removeSubscriber.bind(null, sub.id)}>
                                        <button className="opacity-0 group-hover:opacity-100 p-2 text-gray-300 hover:text-red-500 transition-all rounded-lg hover:bg-red-50">
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
