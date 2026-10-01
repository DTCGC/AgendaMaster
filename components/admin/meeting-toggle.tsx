/**
 * Schedule / Disable button for one Friday on the admin calendar.
 * Disabling clears the Toastmaster's prepared agenda, so it asks first.
 */
'use client'

import { useState } from 'react'
import { CheckCircle, Loader2, XCircle } from 'lucide-react'
import { toggleMeeting } from '@/app/actions/calendar'

export default function MeetingToggle({ ymd, meetingId, scheduled, label }: {
  ymd: string
  meetingId?: string
  scheduled: boolean
  /** The date as shown in the row, for the confirmation. */
  label: string
}) {
  const [busy, setBusy] = useState(false)

  async function handleClick() {
    if (scheduled && !window.confirm(`Disable the meeting on ${label}? Its theme, question, sheet link and minor roles will be cleared.`)) return
    setBusy(true)
    try {
      const result = await toggleMeeting(ymd, meetingId)
      if (!result.success) alert(result.error)
    } finally {
      setBusy(false)
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={busy}
      className={`flex items-center gap-1 px-4 py-2 rounded-lg text-sm font-bold shadow-sm transition-all border disabled:opacity-50 ${scheduled ? 'bg-white text-red-600 border-red-200 hover:bg-red-50' : 'bg-brand-loyal-blue text-white hover:bg-brand-loyal-blue/90'}`}
    >
      {busy ? <Loader2 size={16} className="animate-spin" /> : scheduled ? <XCircle size={16} /> : <CheckCircle size={16} />}
      {scheduled ? 'Disable' : 'Schedule'}
    </button>
  )
}
