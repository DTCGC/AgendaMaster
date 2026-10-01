/**
 * Remove (trash) button for the admin Accounts lists. Confirms first — the
 * delete is permanent — and reports a refusal or failure instead of failing
 * silently.
 */
'use client'

import { useState } from 'react'
import { Loader2, Trash2 } from 'lucide-react'
import { removeUser, removeSubscriber } from '@/app/actions/accounts'

export default function RemoveButton({ kind, id, label }: {
  kind: 'member' | 'subscriber'
  id: string
  /** Who is being removed, for the confirmation ("Sam Lee", "sam@example.com"). */
  label: string
}) {
  const [busy, setBusy] = useState(false)

  async function handleClick() {
    const what = kind === 'member' ? `Remove ${label} from the club roster?` : `Remove ${label} from the guest list?`
    if (!window.confirm(`${what} This cannot be undone.`)) return
    setBusy(true)
    try {
      const result = kind === 'member' ? await removeUser(id) : await removeSubscriber(id)
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
      aria-label={`Remove ${label}`}
      className="p-2 text-gray-400 hover:text-red-600 transition-colors rounded-lg hover:bg-red-50 md:opacity-0 md:group-hover:opacity-100 focus-visible:opacity-100 disabled:opacity-50"
    >
      {busy ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
    </button>
  )
}
