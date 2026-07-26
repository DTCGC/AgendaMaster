/**
 * Major Role Assignment Form
 *
 * Client-side form for the admin Roles panel. Allows admins to assign
 * major roles (Toastmaster, Speakers, etc.) for upcoming meetings.
 * Displays last-active timestamps to help identify priority members.
 */
'use client'

import { useState } from 'react'
import { saveAllMajorRoles } from '@/app/actions/roles'
import { MAJOR_ROLES, BACKUP_SPEAKER } from '@/lib/agenda-logic'
import { Save, CheckCircle2, Info } from 'lucide-react'

type UserData = {
    id: string
    firstName: string
    lastName: string
    roleAssignments: { assignedAt: Date }[]
}

export default function RolesForm({
    meetingId,
    initialAssignments,
    members,
    previousBackup
}: {
    meetingId: string
    initialAssignments: Record<string, string>
    members: UserData[]
    /** Most recent standby before this meeting, for the promotion reminder. */
    previousBackup: { name: string; meetingDate: string } | null
}) {
    const [assignments, setAssignments] = useState<Record<string, string>>(initialAssignments)
    const [isSaving, setIsSaving] = useState(false)
    const [saved, setSaved] = useState(false)

    const handleSave = async () => {
        setIsSaving(true)
        setSaved(false)
        
        // Post only the roles this form renders. Anything else in state would be
        // deleted and recreated by the server action, re-stamping its assignedAt.
        // BACKUP_SPEAKER is included because the form owns it too — omitting it
        // would make every standby assignment silently fail to save.
        const payload = [...MAJOR_ROLES, BACKUP_SPEAKER].map(roleName => ({
            roleName,
            userId: assignments[roleName] || ""
        }))

        await saveAllMajorRoles(meetingId, payload)
        
        setIsSaving(false)
        setSaved(true)
        setTimeout(() => setSaved(false), 3000)
    }

    return (
        <div className="space-y-6">
            <div className="bg-white shadow-sm border rounded-xl overflow-hidden p-6">
                <h3 className="font-bold text-lg mb-6 text-brand-true-maroon flex justify-between items-center">
                    Target Allocations
                    {saved && <span className="text-sm font-bold text-green-600 flex items-center gap-1"><CheckCircle2 size={16} /> Saved Successfully</span>}
                </h3>
                
                <div className="space-y-4">
                    {MAJOR_ROLES.map(role => (
                        <div key={role} className="flex flex-col space-y-1 pb-4 border-b last:border-0 last:pb-0">
                            <label className="text-sm font-semibold text-gray-600">{role}</label>
                            <select 
                                value={assignments[role] || ""}
                                onChange={(e) => setAssignments({ ...assignments, [role]: e.target.value })}
                                className={`w-full p-2 border rounded-lg text-sm bg-gray-50 focus:ring focus:ring-brand-loyal-blue/20 outline-none transition ${assignments[role] ? 'border-brand-loyal-blue text-brand-loyal-blue font-bold shadow-sm' : ''}`}
                            >
                                <option value="">-- UNASSIGNED --</option>
                                {members.map(u => (
                                    <option key={u.id} value={u.id}>
                                        {u.firstName} {u.lastName} 
                                        {u.roleAssignments[0] ? ` (Last Active: ${new Date(u.roleAssignments[0].assignedAt).toLocaleDateString()})` : ` (Never Active)`}
                                    </option>
                                ))}
                            </select>
                        </div>
                    ))}

                    {/* Standby slot — deliberately separated from the major roles
                        above, because holding it leaves a member fully eligible
                        for a minor role in the Toastmaster's auto-assignment. */}
                    <div className="flex flex-col space-y-1 pt-2">
                        <label className="text-sm font-semibold text-gray-600 flex items-center gap-2">
                            {BACKUP_SPEAKER}
                            <span className="text-[10px] font-bold uppercase tracking-tight bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">Standby</span>
                        </label>
                        <select
                            value={assignments[BACKUP_SPEAKER] || ""}
                            onChange={(e) => setAssignments({ ...assignments, [BACKUP_SPEAKER]: e.target.value })}
                            className={`w-full p-2 border rounded-lg text-sm bg-gray-50 focus:ring focus:ring-brand-loyal-blue/20 outline-none transition ${assignments[BACKUP_SPEAKER] ? 'border-brand-loyal-blue text-brand-loyal-blue font-bold shadow-sm' : ''}`}
                        >
                            <option value="">-- UNASSIGNED --</option>
                            {members.map(u => (
                                <option key={u.id} value={u.id}>
                                    {u.firstName} {u.lastName}
                                </option>
                            ))}
                        </select>
                        <p className="text-[11px] text-gray-400 leading-snug pt-1">
                            Counts as roleless — they can still be given a minor role, and their participation history is unaffected.
                        </p>

                        {previousBackup && (
                            <div className="mt-2 flex gap-2 items-start bg-amber-50 border border-amber-200 text-amber-900 rounded-lg p-3">
                                <Info size={15} className="shrink-0 mt-0.5" />
                                <p className="text-xs leading-relaxed">
                                    <strong>{previousBackup.name}</strong> was on standby for{' '}
                                    {new Date(previousBackup.meetingDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}.
                                    If all three speakers turned up, they never got to speak — consider giving them a speaking slot now.
                                </p>
                            </div>
                        )}
                    </div>
                </div>

                <div className="mt-8 pt-4 border-t">
                    <button 
                        onClick={handleSave}
                        disabled={isSaving}
                        className="w-full flex items-center justify-center gap-2 bg-brand-loyal-blue text-white font-bold py-3 rounded-lg hover:bg-opacity-90 transition-all disabled:opacity-50 shadow-md"
                    >
                        <Save size={18} />
                        {isSaving ? 'Synchronizing DB...' : 'Finalize Major Roles'}
                    </button>
                </div>
            </div>
        </div>
    )
}
