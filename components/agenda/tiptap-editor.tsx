/**
 * Tiptap Rich Text Editor Wrapper
 *
 * Provides a WYSIWYG editing experience for the Agenda Wizard's email draft
 * and the admin Mass Broadcast panel. Built on Tiptap/ProseMirror's StarterKit.
 *
 * The `initialized` ref prevents content from being overwritten when the
 * component re-renders after localStorage hydration on the client.
 */
'use client'

import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { Bold, Italic, Strikethrough, List, ListOrdered, type LucideIcon } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Spinner } from '@/components/common/surfaces'
import { cn } from '@/lib/utils'

/** Shown in an empty editor: a sample agenda email. */
const SAMPLE_AGENDA_EMAIL = (
  <>
    <p>Good evening Toastmasters,</p>
    <p>The theme for this week is: <strong>[THEME]</strong>!</p>
    <p>Please review the attached agenda. If you cannot attend, please reply to this email to let us know immediately.</p>
    <p>Best,<br/>Toastmaster</p>
  </>
)

export default function TiptapEditor({
  content,
  onChange,
  placeholder = SAMPLE_AGENDA_EMAIL,
}: {
  content: string,
  onChange: (html: string) => void,
  placeholder?: React.ReactNode,
}) {
  const initialized = useRef(false);

  // Re-render on every transaction so the toolbar's active states stay current.
  const [, setTick] = useState(0);

  const editor = useEditor({
    // List and paragraph styling comes from `.agenda-editor` in globals.css,
    // so the HTML sent in the email carries no app class names.
    extensions: [StarterKit],
    content: content,
    immediatelyRender: false,
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML())
    },
    onTransaction: () => {
      setTick(t => t + 1)
    },
    editorProps: {
      attributes: {
        class: 'agenda-editor min-h-75 p-6 text-sm leading-relaxed text-gray-800 focus:outline-none',
      },
    },
  })

  // Set initial content once if async loaded from localstorage
  useEffect(() => {
    if (editor && content && !initialized.current) {
        editor.commands.setContent(content)
        initialized.current = true;
    }
  }, [content, editor])

  if (!editor) {
    return (
      <div className="flex min-h-75 items-center justify-center gap-2 rounded-xl border border-gray-200 bg-gray-50 text-sm text-gray-500">
        <Spinner /> Loading editor…
      </div>
    )
  }

  const tools: { label: string; icon: LucideIcon; active: string; run: () => void }[] = [
    { label: 'Bold', icon: Bold, active: 'bold', run: () => editor.chain().focus().toggleBold().run() },
    { label: 'Italic', icon: Italic, active: 'italic', run: () => editor.chain().focus().toggleItalic().run() },
    { label: 'Strikethrough', icon: Strikethrough, active: 'strike', run: () => editor.chain().focus().toggleStrike().run() },
    { label: 'Bulleted list', icon: List, active: 'bulletList', run: () => editor.chain().focus().toggleBulletList().run() },
    { label: 'Numbered list', icon: ListOrdered, active: 'orderedList', run: () => editor.chain().focus().toggleOrderedList().run() },
  ]

  return (
    <div
      data-shot="email-editor"
      className="flex flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm transition-colors focus-within:border-brand-loyal-blue focus-within:ring-3 focus-within:ring-brand-loyal-blue/15"
    >
      <div className="flex items-center gap-1 border-b border-gray-200 bg-gray-50 p-2" role="toolbar" aria-label="Formatting">
        {tools.map((tool, i) => (
          <span key={tool.label} className="contents">
            {i === 3 && <span aria-hidden className="mx-2 h-6 w-px bg-gray-300" />}
            <button
              type="button"
              onClick={tool.run}
              aria-label={tool.label}
              aria-pressed={editor.isActive(tool.active)}
              title={tool.label}
              className={cn(
                "rounded-lg p-2 transition-colors hover:bg-gray-200",
                editor.isActive(tool.active) ? "bg-gray-200 text-brand-true-maroon" : "text-gray-600"
              )}
            >
              <tool.icon size={18} />
            </button>
          </span>
        ))}
      </div>
      <div className="relative grow">
        {editor.isEmpty && (
          <div aria-hidden className="agenda-editor pointer-events-none absolute inset-0 p-6 text-sm leading-relaxed text-gray-400">
            {placeholder}
          </div>
        )}
        <EditorContent editor={editor} className="h-full" />
      </div>
    </div>
  )
}
