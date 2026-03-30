import { auth } from '@/auth'
import { db } from '@/lib/db'
import { redirect } from 'next/navigation'
import { getFutureFridays, toggleMeeting, deleteMeeting } from '@/app/actions/calendar'
import { Calendar as CalendarIcon, Clock, Trash2, CheckCircle, XCircle, AlertCircle } from 'lucide-react'

export const metadata = {
  title: 'Master Calendar - DTCGC',
}

export default async function CalendarPage() {
  const session = await auth()
  
  if (session?.user?.role !== 'ADMIN') {
    redirect('/agenda')
  }

  // Fetch all existing meetings
  const existingMeetings = await db.meeting.findMany({
    include: { template: true, roleAssignments: true }
  })

  // Generate potential Fridays
  const potentialFridays = await getFutureFridays()

  return (
    <div className="flex-1 p-8 bg-brand-cool-grey/10 min-h-screen">
      <div className="max-w-4xl mx-auto space-y-8">
        
        <div className="flex justify-between items-end border-b pb-4">
          <div>
            <h1 className="text-3xl font-extrabold text-brand-loyal-blue tracking-tight">Academic Calendar</h1>
            <p className="text-gray-600">Schedule meetings for upcoming Fridays. (Jul/Aug automatically omitted)</p>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
            <table className="w-full text-left border-collapse">
                <thead>
                    <tr className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wider">
                        <th className="p-4 font-semibold border-b">Meeting Date</th>
                        <th className="p-4 font-semibold border-b text-center">Status</th>
                        <th className="p-4 font-semibold border-b text-right">Actions</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                    {potentialFridays.map(date => {
                        const existing = existingMeetings.find((m: any) => 
                            new Date(m.date).toDateString() === date.toDateString()
                        );
                        
                        return (
                            <tr key={date.toISOString()} className={`hover:bg-gray-50/50 transition-colors ${existing?.status === 'CANCELLED' ? 'opacity-50' : ''}`}>
                                <td className="p-4">
                                    <div className="font-bold text-brand-loyal-blue">
                                        {date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
                                    </div>
                                    <div className="text-xs text-gray-500 flex items-center gap-1">
                                        <Clock size={12} /> Standard 6:45 PM Start
                                    </div>
                                </td>
                                <td className="p-4 text-center">
                                    {existing ? (
                                        <span className={`px-3 py-1 rounded-full text-xs font-bold border ${existing.status === 'SCHEDULED' ? 'bg-green-50 text-green-700 border-green-200' : 'bg-red-50 text-red-700 border-red-200'}`}>
                                            {existing.status}
                                        </span>
                                    ) : (
                                        <span className="px-3 py-1 rounded-full text-xs font-bold bg-gray-100 text-gray-400 border border-gray-200">
                                            NOT SCHEDULED
                                        </span>
                                    )}
                                </td>
                                <td className="p-4">
                                    <div className="flex justify-end gap-2">
                                        <form action={toggleMeeting.bind(null, date.toISOString(), existing?.id)}>
                                            <button 
                                                className={`flex items-center gap-1 px-4 py-2 rounded-lg text-sm font-bold shadow-sm transition-all border ${existing?.status === 'SCHEDULED' ? 'bg-white text-red-600 border-red-200 hover:bg-red-50' : 'bg-brand-loyal-blue text-white hover:bg-opacity-90'}`}
                                            >
                                                {existing?.status === 'SCHEDULED' ? (
                                                    <><XCircle size={16} /> Disable</>
                                                ) : (
                                                    <><CheckCircle size={16} /> Schedule</>
                                                )}
                                            </button>
                                        </form>
                                    </div>
                                </td>
                            </tr>
                        )
                    })}
                </tbody>
            </table>
        </div>

        <div className="bg-blue-50 border border-blue-200 p-6 rounded-xl flex gap-4">
            <AlertCircle className="text-blue-600 shrink-0" size={24} />
            <div className="text-sm text-blue-800 space-y-2">
                <p className="font-bold">Manual Overrides</p>
                <p>As per school district variations, breaks (Winter/Spring) must be manually "Disabled" above. Once a meeting is disabled, the Agenda Engine will skip it and target the next active Friday automatically.</p>
            </div>
        </div>
      </div>
    </div>
  )
}
