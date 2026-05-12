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
import { MAJOR_ROLES } from '@/lib/agenda-logic'
import { Save, CheckCircle2 } from 'lucide-react'

type UserData = {
    id: string
    firstName: string
    lastName: string
    roleAssignments: { assignedAt: Date }[]
}

export default function RolesForm({ 
    meetingId, 
    initialAssignments, 
    members 
}: { 
    meetingId: string
    initialAssignments: Record<string, string>
    members: UserData[]
}) {
    const [assignments, setAssignments] = useState<Record<string, string>>(initialAssignments)
    const [isSaving, setIsSaving] = useState(false)
    const [saved, setSaved] = useState(false)

    const handleSave = async () => {
        setIsSaving(true)
        setSaved(false)
        
        const payload = Object.entries(assignments).map(([roleName, userId]) => ({
            roleName,
            userId
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
