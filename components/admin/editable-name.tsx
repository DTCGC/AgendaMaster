/**
 * Inline Editable Name Component
 *
 * Renders a member's name as clickable text that transforms into
 * a two-field editor (first + last name) on click. Supports
 * keyboard submission (Enter) and escape-to-cancel.
 */
'use client'

import { useState } from 'react'
import { updateUserName } from '@/app/actions/accounts'
import { Pencil, Check, X } from 'lucide-react'

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

  async function handleSave() {
    if (!fn.trim() || !ln.trim()) return;
    setSaving(true);
    try {
      const formData = new FormData();
      formData.set('userId', userId);
      formData.set('firstName', fn.trim());
      formData.set('lastName', ln.trim());
      await updateUserName(formData);
      setEditing(false);
    } catch (err) {
      console.error('Name update failed:', err);
    } finally {
      setSaving(false);
    }
  }

  function handleCancel() {
    setFn(firstName);
    setLn(lastName);
    setEditing(false);
  }

  if (!editing) {
    return (
      <div className="flex items-center gap-2 group/name">
        <span className="font-bold text-sm text-gray-800">
          {firstName} {lastName}
        </span>
        <button
          onClick={() => setEditing(true)}
          className="opacity-0 group-hover/name:opacity-100 p-1 text-gray-300 hover:text-brand-loyal-blue transition-all rounded"
          title="Edit name"
        >
          <Pencil size={12} />
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1.5 animate-in fade-in duration-150">
      <input
        type="text"
        value={fn}
        onChange={(e) => setFn(e.target.value)}
        className="border border-gray-300 rounded px-2 py-1 text-xs font-medium w-20 focus:border-brand-loyal-blue outline-none"
        placeholder="First"
        autoFocus
        disabled={saving}
      />
      <input
        type="text"
        value={ln}
        onChange={(e) => setLn(e.target.value)}
        className="border border-gray-300 rounded px-2 py-1 text-xs font-medium w-24 focus:border-brand-loyal-blue outline-none"
        placeholder="Last"
        disabled={saving}
      />
      <button
        onClick={handleSave}
        disabled={saving || !fn.trim() || !ln.trim()}
        className="p-1 text-green-600 hover:text-green-700 hover:bg-green-50 rounded transition-colors disabled:opacity-40"
        title="Save"
      >
        <Check size={14} />
      </button>
      <button
        onClick={handleCancel}
        disabled={saving}
        className="p-1 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors"
        title="Cancel"
      >
        <X size={14} />
      </button>
    </div>
  );
}
