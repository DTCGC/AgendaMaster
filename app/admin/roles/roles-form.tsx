/**
 * Major Role Assignment Form
 *
 * Client-side form for the admin Roles panel. Allows admins to assign
 * major roles (Toastmaster, Speakers, etc.) for upcoming meetings.
 * Displays last-active timestamps to help identify priority members.
 */
'use client'

import { useState } from 'react'
import { saveAllMajorRoles, saveGuestSpeakerName } from '@/app/actions/roles'
import { MAJOR_ROLES, BACKUP_SPEAKER } from '@/lib/roles'
import { Save, CheckCircle2, Info, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input, NativeSelect } from '@/components/ui/input'
import { Label, FieldHint } from '@/components/ui/label'
import { Badge, Card, CardHeader, FormError, Notice, Spinner } from '@/components/common/surfaces'
import { formatMeetingDate, formatMeetingDateShort } from '@/lib/meeting-time'

type UserData = {
    id: string
    firstName: string
    lastName: string
    /** ISO date of the last meeting (before this one) where they held a major role. */
    lastMajorRole: string | null
}

export default function RolesForm({
    meetingId,
    initialAssignments,
    members,
    previousBackup,
    initialGuestSpeakerName
}: {
    meetingId: string
    initialAssignments: Record<string, string>
    members: UserData[]
    /**
     * Most recent standby before this meeting, for the promotion reminder.
     * `roleHere` is the major role they already hold in this meeting, if any.
     */
    previousBackup: { name: string; meetingDate: string; roleHere: string | null } | null
    /** Free-text guest speaker (meeting-level, not a member). */
    initialGuestSpeakerName: string
}) {
    const [assignments, setAssignments] = useState<Record<string, string>>(initialAssignments)
    const [guestSpeakerName, setGuestSpeakerName] = useState(initialGuestSpeakerName)
    const [isSaving, setIsSaving] = useState(false)
    const [saved, setSaved] = useState(false)
    const [error, setError] = useState('')

    const handleSave = async () => {
        setIsSaving(true)
        setSaved(false)
        setError('')
        
        // Post only the roles this form renders. Anything else in state would be
        // deleted and recreated by the server action, re-stamping its assignedAt.
        // BACKUP_SPEAKER is included because the form owns it too — omitting it
        // would make every standby assignment silently fail to save.
        const payload = [...MAJOR_ROLES, BACKUP_SPEAKER].map(roleName => ({
            roleName,
            userId: assignments[roleName] || ""
        }))

        const results = await Promise.all([
            saveAllMajorRoles(meetingId, payload),
            saveGuestSpeakerName(meetingId, guestSpeakerName)
        ])
        const failure = results.find((r) => !r.success)

        setIsSaving(false)
        if (failure && !failure.success) {
            setError(failure.error)
            return
        }
        setSaved(true)
        setTimeout(() => setSaved(false), 3000)
    }

    // A filled-in field reads as "assigned" at a glance.
    const filled = (value: string) => value ? "border-brand-loyal-blue font-bold text-brand-loyal-blue" : undefined

    return (
        <Card>
            <CardHeader
                icon={Users}
                actions={saved && <span className="flex items-center gap-1 text-sm font-bold text-green-700"><CheckCircle2 size={16} /> Saved</span>}
            >
                Major Role Assignments
            </CardHeader>
            <div className="p-6">
                {error && <FormError className="mb-4">{error}</FormError>}

                <div className="space-y-4">
                    {MAJOR_ROLES.map(role => {
                        const id = `role-${role.replace(/\s+/g, '-').toLowerCase()}`
                        return (
                        <div key={role} className="border-b border-gray-100 pb-4 last:border-0 last:pb-0">
                            <Label htmlFor={id}>{role}</Label>
                            <NativeSelect
                                id={id}
                                value={assignments[role] || ""}
                                onChange={(e) => setAssignments({ ...assignments, [role]: e.target.value })}
                                className={filled(assignments[role])}
                            >
                                <option value="">-- UNASSIGNED --</option>
                                {members.map(u => (
                                    <option key={u.id} value={u.id}>
                                        {u.firstName} {u.lastName}
                                        {u.lastMajorRole ? ` (Last major role: ${formatMeetingDate(new Date(u.lastMajorRole))})` : ` (No major role yet)`}
                                    </option>
                                ))}
                            </NativeSelect>
                        </div>
                        )
                    })}

                    {/* Guest speaker — free text, NOT a member dropdown. A guest
                        has no User row. Inert unless the Toastmaster also marks
                        the meeting a Guest Education Session in the wizard; only
                        then does it replace Speaker 3 on the agenda sheet. */}
                    <div className="border-b border-gray-100 pb-4">
                        <Label htmlFor="guest-speaker" className="flex items-center gap-2">
                            Guest Speaker Name
                            <Badge>Education Session</Badge>
                        </Label>
                        <Input
                            id="guest-speaker"
                            type="text"
                            value={guestSpeakerName}
                            onChange={(e) => setGuestSpeakerName(e.target.value)}
                            placeholder="e.g., Dr. Jane Doe (external guest)"
                            className={filled(guestSpeakerName.trim())}
                        />
                        <FieldHint>
                            Only takes effect if the Toastmaster selects &quot;Guest Education Session&quot; in the wizard — it then replaces Speaker 3 on the sheet. Otherwise it is ignored and the Speaker 3 dropdown above applies as usual.
                        </FieldHint>
                    </div>

                    {/* Standby slot — deliberately separated from the major roles
                        above, because holding it leaves a member fully eligible
                        for a minor role in the Toastmaster's auto-assignment. */}
                    <div className="pt-2">
                        <Label htmlFor="backup-speaker" className="flex items-center gap-2">
                            {BACKUP_SPEAKER}
                            <Badge>Standby</Badge>
                        </Label>
                        <NativeSelect
                            id="backup-speaker"
                            value={assignments[BACKUP_SPEAKER] || ""}
                            onChange={(e) => setAssignments({ ...assignments, [BACKUP_SPEAKER]: e.target.value })}
                            className={filled(assignments[BACKUP_SPEAKER])}
                        >
                            <option value="">-- UNASSIGNED --</option>
                            {members.map(u => (
                                <option key={u.id} value={u.id}>
                                    {u.firstName} {u.lastName}
                                </option>
                            ))}
                        </NativeSelect>
                        <FieldHint>
                            Counts as roleless — they can still be given a minor role, and their participation history is unaffected. They are also given a random open speaker slot (1–3) at the next scheduled meeting.
                        </FieldHint>

                        {previousBackup && (previousBackup.roleHere ? (
                            <Notice tone="brand" icon={Info} className="mt-3">
                                <p>
                                    <strong>{previousBackup.name}</strong> was on standby for{' '}
                                    {formatMeetingDateShort(new Date(previousBackup.meetingDate))}, so
                                    they are {previousBackup.roleHere} at this meeting.
                                    If they ended up speaking that day, you can give the slot to someone else.
                                </p>
                            </Notice>
                        ) : (
                            <Notice tone="warning" icon={Info} className="mt-3">
                                <p>
                                    <strong>{previousBackup.name}</strong> was on standby for{' '}
                                    {formatMeetingDateShort(new Date(previousBackup.meetingDate))}.
                                    If all three speakers turned up, they never got to speak — consider giving them a speaking slot now.
                                </p>
                            </Notice>
                        ))}
                    </div>
                </div>

                <div className="mt-8 border-t border-gray-200 pt-6">
                    <Button size="lg" onClick={handleSave} disabled={isSaving} className="w-full">
                        {isSaving ? <Spinner size={18} /> : <Save />}
                        {isSaving ? 'Saving…' : 'Save Major Roles'}
                    </Button>
                </div>
            </div>
        </Card>
    )
}
