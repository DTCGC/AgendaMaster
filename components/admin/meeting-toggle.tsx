/**
 * Schedule / Disable button for one Friday on the admin calendar.
 * Disabling clears the Toastmaster's prepared agenda, so it asks first.
 */
'use client'

import { useState } from 'react'
import { CalendarX, CheckCircle, XCircle } from 'lucide-react'
import { toggleMeeting } from '@/app/actions/calendar'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/common/confirm-dialog'
import { FormError, Spinner } from '@/components/common/surfaces'

export default function MeetingToggle({ ymd, meetingId, scheduled, label }: {
  ymd: string
  meetingId?: string
  scheduled: boolean
  /** The date as shown in the row, for the confirmation. */
  label: string
}) {
  const [busy, setBusy] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState('')

  async function run() {
    setBusy(true)
    setError('')
    try {
      const result = await toggleMeeting(ymd, meetingId)
      if (result.success) setConfirming(false)
      else setError(result.error)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      {scheduled ? (
        <Button variant="destructive-outline" size="sm" onClick={() => { setError(''); setConfirming(true) }}>
          <XCircle /> Disable
        </Button>
      ) : (
        <Button size="sm" onClick={run} disabled={busy}>
          {busy ? <Spinner size={14} /> : <CheckCircle />} Schedule
        </Button>
      )}
      {!confirming && error && <p role="alert" className="max-w-56 text-right text-xs font-medium text-red-600">{error}</p>}

      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        tone="danger"
        icon={CalendarX}
        title="Disable this meeting?"
        description={<>The meeting on <strong className="text-white">{label}</strong> will be cancelled. Its theme, question, sheet link and minor roles are cleared; major roles are kept.</>}
        confirmLabel="Disable Meeting"
        busy={busy}
        onConfirm={run}
      >
        {error && <FormError>{error}</FormError>}
      </ConfirmDialog>
    </div>
  )
}
