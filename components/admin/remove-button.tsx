/**
 * Remove (trash) button for the admin Accounts lists. Confirms first — the
 * delete is permanent — and reports a refusal or failure instead of failing
 * silently. Always visible on touch screens; revealed on hover with a mouse.
 */
'use client'

import { useState } from 'react'
import { Trash2 } from 'lucide-react'
import { removeUser, removeSubscriber } from '@/app/actions/accounts'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/common/confirm-dialog'
import { FormError } from '@/components/common/surfaces'

export default function RemoveButton({ kind, id, label }: {
  kind: 'member' | 'subscriber'
  id: string
  /** Who is being removed, for the confirmation ("Sam Lee", "sam@example.com"). */
  label: string
}) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function handleConfirm() {
    setBusy(true)
    setError('')
    try {
      const result = kind === 'member' ? await removeUser(id) : await removeSubscriber(id)
      if (result.success) setOpen(false)
      else setError(result.error)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={() => { setError(''); setOpen(true) }}
        aria-label={`Remove ${label}`}
        className="shrink-0 text-gray-400 hover:bg-red-50 hover:text-red-600 focus-visible:opacity-100 md:opacity-0 md:group-hover:opacity-100"
      >
        <Trash2 />
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        tone="danger"
        icon={Trash2}
        title={kind === 'member' ? 'Remove this member?' : 'Remove this guest?'}
        description={
          kind === 'member'
            ? <><strong className="text-white">{label}</strong> will lose access to the portal. Their past roles stay on old agendas. This cannot be undone.</>
            : <><strong className="text-white">{label}</strong> will stop receiving club emails. This cannot be undone.</>
        }
        confirmLabel="Remove"
        busy={busy}
        onConfirm={handleConfirm}
      >
        {error && <FormError>{error}</FormError>}
      </ConfirmDialog>
    </>
  )
}
