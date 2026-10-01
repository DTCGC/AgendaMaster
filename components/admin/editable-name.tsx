/**
 * Inline Editable Name Component
 *
 * Renders a member's name as clickable text that transforms into
 * a two-field editor (first + last name) on click. Enter saves and Escape
 * cancels.
 */
'use client'

import { useState } from 'react'
import { updateUserName } from '@/app/actions/accounts'
import { Pencil, Check, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

/**
 * Inline name editor for the admin accounts panel.
 * Shows the current name with a pencil icon; clicking opens editable fields.
 */
export default function EditableName({ userId, firstName, lastName }: {
  userId: string;
  firstName: string;
  lastName: string;
}) {
  const [editing, setEditing] = useState(false);
  const [fn, setFn] = useState(firstName);
  const [ln, setLn] = useState(lastName);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleSave() {
    if (!fn.trim() || !ln.trim()) return;
    setSaving(true);
    setError('');
    try {
      const result = await updateUserName(userId, fn, ln);
      if (result.success) setEditing(false);
      else setError(result.error);
    } catch (err) {
      console.error('Name update failed:', err);
      setError('The name could not be saved.');
    } finally {
      setSaving(false);
    }
  }

  function handleCancel() {
    setFn(firstName);
    setLn(lastName);
    setError('');
    setEditing(false);
  }

  if (!editing) {
    return (
      <div className="group/name flex items-center gap-1">
        <span className="text-sm font-bold text-gray-800">
          {firstName} {lastName}
        </span>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => setEditing(true)}
          aria-label={`Edit ${firstName} ${lastName}'s name`}
          title="Edit name"
          className="size-7 text-gray-400 hover:text-brand-loyal-blue focus-visible:opacity-100 md:opacity-0 md:group-hover/name:opacity-100"
        >
          <Pencil size={13} />
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <form
        className="flex items-center gap-1.5 animate-in fade-in duration-150"
        onSubmit={(e) => { e.preventDefault(); handleSave(); }}
        onKeyDown={(e) => { if (e.key === 'Escape') handleCancel(); }}
      >
        <Input
          size="sm"
          type="text"
          value={fn}
          onChange={(e) => setFn(e.target.value)}
          className="w-24"
          placeholder="First"
          aria-label="First name"
          autoFocus
          disabled={saving}
        />
        <Input
          size="sm"
          type="text"
          value={ln}
          onChange={(e) => setLn(e.target.value)}
          className="w-28"
          placeholder="Last"
          aria-label="Last name"
          disabled={saving}
        />
        <Button
          type="submit"
          variant="ghost"
          size="icon-sm"
          disabled={saving || !fn.trim() || !ln.trim()}
          className="text-green-700 hover:bg-green-50 hover:text-green-800"
          aria-label="Save name"
        >
          <Check />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={handleCancel}
          disabled={saving}
          className="text-gray-500 hover:bg-red-50 hover:text-red-600"
          aria-label="Cancel"
        >
          <X />
        </Button>
      </form>
      {error && <p role="alert" className="text-xs font-medium text-red-600">{error}</p>}
    </div>
  );
}
