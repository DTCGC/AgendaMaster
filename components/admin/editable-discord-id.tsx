/**
 * Inline Discord ID Editor
 *
 * Lets an admin attach a member's Discord user ID on Member Management, so
 * the #next-meeting-roles post can mention them (lib/next-meeting-roles.ts).
 * Same pattern as EditableName: click to edit, Enter saves, Escape cancels.
 * Saving an empty value removes the ID.
 */
'use client'

import { useState } from 'react'
import { updateDiscordId } from '@/app/actions/accounts'
import { AtSign, Pencil, Check, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export default function EditableDiscordId({ userId, name, discordId }: {
  userId: string;
  /** For the controls' accessible labels. */
  name: string;
  discordId: string | null;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(discordId ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleSave() {
    setSaving(true);
    setError('');
    try {
      const result = await updateDiscordId(userId, value);
      if (result.success) setEditing(false);
      else setError(result.error);
    } catch (err) {
      console.error('Discord ID update failed:', err);
      setError('The Discord ID could not be saved.');
    } finally {
      setSaving(false);
    }
  }

  function handleCancel() {
    setValue(discordId ?? '');
    setError('');
    setEditing(false);
  }

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        aria-label={`${discordId ? 'Edit' : 'Add'} ${name}'s Discord ID`}
        title={discordId ? `Discord user ID ${discordId}` : 'Add their Discord user ID so the roles post can ping them'}
        className="group/discord mt-0.5 flex items-center gap-1 rounded text-xs text-gray-500 hover:text-brand-loyal-blue focus-visible:outline-2 focus-visible:outline-brand-loyal-blue"
      >
        <AtSign size={12} />
        {discordId ? <span className="font-semibold text-gray-600">Discord linked</span> : <span>Add Discord ID</span>}
        <Pencil size={11} className="md:opacity-0 md:group-hover/discord:opacity-100" />
      </button>
    );
  }

  return (
    <div className="mt-1 space-y-1">
      <form
        className="flex items-center gap-1.5 animate-in fade-in duration-150"
        onSubmit={(e) => { e.preventDefault(); handleSave(); }}
        onKeyDown={(e) => { if (e.key === 'Escape') handleCancel(); }}
      >
        <Input
          size="sm"
          type="text"
          inputMode="numeric"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="w-52"
          placeholder="Discord user ID"
          aria-label={`${name}'s Discord user ID`}
          autoFocus
          disabled={saving}
        />
        <Button
          type="submit"
          variant="ghost"
          size="icon-sm"
          disabled={saving}
          className="text-green-700 hover:bg-green-50 hover:text-green-800"
          aria-label="Save Discord ID"
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
      {error ? (
        <p role="alert" className="text-xs font-medium text-red-600">{error}</p>
      ) : (
        <p className="text-xs text-gray-500">
          In Discord, turn on Settings → Advanced → Developer Mode, then right-click the member → Copy User ID. Leave empty to remove.
        </p>
      )}
    </div>
  );
}
