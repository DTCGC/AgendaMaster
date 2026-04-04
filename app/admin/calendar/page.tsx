import { auth } from '@/auth'
import { db } from '@/lib/db'
import { redirect } from 'next/navigation'
import { getFutureFridays, toggleMeeting, deleteMeeting } from '@/app/actions/calendar'
import { Calendar as CalendarIcon, Clock, Trash2, CheckCircle, XCircle, AlertCircle, FileText } from 'lucide-react'
import Link from 'next/link'

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

  // Archival threshold: 9:00 PM on the meeting date.
  // We use 2 hours and 15 mins (8100000ms) past the 6:45 PM start time.
  const archivalThreshold = new Date(Date.now() - 8100000);
  
  const pastMeetings = existingMeetings
    .filter((m: any) => m.status === 'ARCHIVED' || (m.status === 'COMPLETED') || new Date(m.date) < archivalThreshold)
    .sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime());

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
                            new Date(m.date).toDateString() === date.toDateString() && m.status !== 'ARCHIVED'
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
                                        <span className={`px-3 py-1 rounded-full text-xs font-bold border ${
                                            existing.status === 'SCHEDULED' ? 'bg-green-50 text-green-700 border-green-200' : 
                                            existing.status === 'CANCELLED' ? 'bg-red-50 text-red-700 border-red-200' :
                                            'bg-gray-50 text-gray-700 border-gray-200'
                                        }`}>
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

        <div className="mt-12">
            <h2 className="text-2xl font-bold text-gray-800 mb-4 border-b pb-2 tracking-tight">Meeting Archive</h2>
            <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
                <table className="w-full text-left border-collapse">
                    <thead>
                        <tr className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wider">
                            <th className="p-4 font-semibold border-b">Meeting Date</th>
                            <th className="p-4 font-semibold border-b text-center">Status</th>
                            <th className="p-4 font-semibold border-b text-right">Records</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {pastMeetings.length === 0 ? (
                            <tr><td colSpan={3} className="p-8 text-center text-gray-400 italic">No past meetings recorded.</td></tr>
                        ) : pastMeetings.map((m: any) => (
                            <tr key={m.id} className="hover:bg-gray-50/50 transition-colors">
                                <td className="p-4">
                                    <div className="font-bold text-gray-700">
                                        {new Date(m.date).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
                                    </div>
                                    <div className="text-xs text-gray-500">Scheduled Time: 6:45 PM</div>
                                </td>
                                <td className="p-4 text-center">
                                    <span className={`px-3 py-1 rounded-full text-xs font-bold border ${
                                        m.status === 'ARCHIVED' ? 'bg-brand-loyal-blue/10 text-brand-loyal-blue border-brand-loyal-blue/20' : 
                                        m.status === 'COMPLETED' ? 'bg-purple-50 text-purple-700 border-purple-200' : 
                                        m.status === 'CANCELLED' ? 'bg-red-50 text-red-700 border-red-200' : 
                                        'bg-gray-100 text-gray-600 border-gray-200'
                                    }`}>
                                        {m.status}
                                    </span>
                                </td>
                                <td className="p-4 flex justify-end">
                                    {m.status !== 'CANCELLED' && (
                                        <Link href={`/agenda?archivedId=${m.id}`} className="flex items-center gap-1 text-brand-true-maroon hover:text-red-900 font-bold text-sm bg-brand-true-maroon/10 px-4 py-2 rounded-lg transition-colors">
                                            <FileText size={16} /> View Records
                                        </Link>
                                    )}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
      </div>
    </div>
  )
}
