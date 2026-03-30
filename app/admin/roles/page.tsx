import { auth } from '@/auth'
import { db } from '@/lib/db'
import { redirect } from 'next/navigation'
import RolesForm from './roles-form'
import { MAJOR_ROLES } from '@/lib/agenda-logic'
import { AlertCircle, Calendar as CalendarIcon, ChevronRight } from 'lucide-react'

type RoleAssignment = {
    userId: string | null;
    roleName: string;
}

export const metadata = {
  title: 'Role Management - DTCGC',
}

export default async function RolesPage({
    searchParams,
}: {
    searchParams: Promise<{ meetingId?: string }>
}) {
  const session = await auth()
  const params = await searchParams;
  
  if (session?.user?.role !== 'ADMIN') {
    redirect('/agenda')
  }

  // Fetch upcoming scheduled meetings (next 10)
  const upcomingMeetings = await db.meeting.findMany({
    where: { date: { gte: new Date() }, status: 'SCHEDULED' },
    orderBy: { date: 'asc' },
    include: { roleAssignments: true },
    take: 10
  })

  // Determine which meeting we are currently editing
  const targetMeetingId = params.meetingId || upcomingMeetings[0]?.id;
  const currentMeeting = upcomingMeetings.find((m: any) => m.id === targetMeetingId) || upcomingMeetings[0];

  // Grab active roster
  const members = await db.user.findMany({
    where: { role: 'MEMBER' },
    include: {
        roleAssignments: {
            orderBy: { assignedAt: 'desc' },
            take: 1
        }
    }
  })

  return (
    <div className="flex-1 p-8 bg-brand-cool-grey/10 min-h-screen">
      <div className="max-w-6xl mx-auto space-y-8">
        
        <div className="flex flex-col md:flex-row justify-between items-start md:items-end border-b pb-6 gap-4">
          <div>
            <h1 className="text-3xl font-extrabold text-brand-loyal-blue tracking-tight">Assign Major Roles</h1>
            <p className="text-gray-600">Assign key roles (like Toastmaster) for any upcoming meetings.</p>
          </div>
        </div>

        {upcomingMeetings.length === 0 ? (
            <div className="bg-brand-happy-yellow/20 p-8 rounded-xl border border-brand-happy-yellow text-center space-y-4">
                 <AlertCircle size={48} className="mx-auto text-yellow-700" opacity={0.5} />
                 <h2 className="text-xl font-bold text-yellow-900">No Scheduled Meetings Found</h2>
                 <p className="text-yellow-800 max-w-lg mx-auto">
                     No upcoming meetings found. Please schedule a meeting in the <b>Master Calendar</b> first.
                 </p>
            </div>
        ) : (
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
                {/* Meeting Selector Sidebar */}
                <div className="lg:col-span-1 space-y-4">
                    <h3 className="text-sm font-bold text-gray-400 uppercase tracking-widest px-2">Upcoming Meetings</h3>
                    <div className="space-y-2">
                        {upcomingMeetings.map((meeting: any) => (
                            <a 
                                key={meeting.id}
                                href={`?meetingId=${meeting.id}`}
                                className={`block p-4 rounded-xl border transition-all ${meeting.id === currentMeeting?.id ? 'bg-brand-true-maroon text-white border-brand-true-maroon shadow-md' : 'bg-white hover:bg-gray-50 text-gray-700 border-gray-200'}`}
                            >
                                <div className="flex justify-between items-center">
                                    <div className="space-y-1">
                                        <div className="font-black text-lg">
                                            {new Date(meeting.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                        </div>
                                        <div className={`text-xs ${meeting.id === currentMeeting?.id ? 'text-white/70' : 'text-gray-500'}`}>
                                            {meeting.theme || "TBD Theme"}
                                        </div>
                                    </div>
                                    <ChevronRight size={18} className={meeting.id === currentMeeting?.id ? 'text-white' : 'text-gray-300'} />
                                </div>
                            </a>
                        ))}
                    </div>
                </div>

                <div className="lg:col-span-3 grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div className="space-y-6">
                        <div className="bg-white border p-6 rounded-xl flex items-center justify-between shadow-sm">
                            <div>
                                <span className="text-xs font-bold text-brand-true-maroon uppercase tracking-wide">Currently Editing</span>
                                <h2 className="text-xl font-black text-gray-800">
                                    {new Date(currentMeeting.date).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
                                </h2>
                            </div>
                            <CalendarIcon size={24} className="text-gray-200" />
                        </div>

                        <RolesForm 
                            meetingId={currentMeeting.id}
                            initialAssignments={currentMeeting.roleAssignments.reduce((acc: Record<string, string>, curr: RoleAssignment) => {
                                acc[curr.roleName] = curr.userId || ""
                                return acc
                            }, {})}
                            members={members.map((u: any) => ({
                                id: u.id,
                                firstName: u.firstName,
                                lastName: u.lastName,
                                roleAssignments: u.roleAssignments.map((ra: any) => ({ assignedAt: ra.assignedAt }))
                            }))}
                        />
                    </div>

                    <div className="bg-white shadow-sm border rounded-xl p-6">
                        <h3 className="font-bold text-lg mb-6 text-gray-800">Participation History</h3>
                        <p className="text-sm text-gray-500 mb-6 border-b pb-4 leading-relaxed">
                            Members who haven't had a role in a while are prioritized. Lower in the list = Higher availability.
                        </p>
 streams                        
                        <div className="space-y-2 overflow-y-auto max-h-[600px] pr-2">
                            {members.sort((a: any, b: any) => {
                                const dateA = a.roleAssignments[0]?.assignedAt ? new Date(a.roleAssignments[0].assignedAt).getTime() : 0;
                                const dateB = b.roleAssignments[0]?.assignedAt ? new Date(b.roleAssignments[0].assignedAt).getTime() : 0;
                                return dateA - dateB; 
                            }).map((member: any) => (
                                <div key={member.id} className="flex justify-between items-center text-sm p-3 border rounded-lg hover:bg-gray-50 transition-colors">
                                    <div>
                                        <span className="font-semibold text-gray-800">{member.firstName} {member.lastName}</span>
                                        {member.role === 'ADMIN' && <span className="ml-2 text-[10px] bg-red-100 text-red-800 px-2 rounded-full font-bold uppercase tracking-tighter">EXEC</span>}
                                    </div>
                                    <span className="text-gray-500 text-xs tabular-nums">
                                        {member.roleAssignments[0] 
                                            ? `${Math.floor((new Date().getTime() - new Date(member.roleAssignments[0].assignedAt).getTime()) / (1000 * 3600 * 24))}d ago` 
                                            : `Priority`
                                        }
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        )}
      </div>
    </div>
  )
}
