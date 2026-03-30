'use client'

import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import BulletList from '@tiptap/extension-bullet-list'
import OrderedList from '@tiptap/extension-ordered-list'
import ListItem from '@tiptap/extension-list-item'
import { Bold, Italic, Strikethrough, List, ListOrdered } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

export default function TiptapEditor({ 
  content, 
  onChange 
}: { 
  content: string, 
  onChange: (html: string) => void 
}) {
  const initialized = useRef(false);

  const [tick, setTick] = useState(0);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        bulletList: false, // Override to use explicit extensions
        orderedList: false,
        listItem: false,
      }),
      BulletList.configure({
        HTMLAttributes: {
          class: 'list-disc ml-4',
        },
      }),
      OrderedList.configure({
        HTMLAttributes: {
          class: 'list-decimal ml-4',
        },
      }),
      ListItem,
    ],
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
        class: 'prose prose-sm sm:prose lg:prose-lg max-w-none focus:outline-none min-h-[300px] p-6 bg-white border border-gray-200 rounded-b-lg transition-colors',
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
    return <div className="min-h-[300px] border rounded-lg bg-gray-50 flex items-center justify-center text-gray-400 animate-pulse">Loading Editor Framework...</div>
  }

  return (
    <div className="flex flex-col shadow-sm rounded-lg overflow-hidden group">
      <style jsx global>{`
        .prose ul {
          list-style-type: disc !important;
          padding-left: 1.5rem !important;
          margin-top: 0.5rem !important;
          margin-bottom: 0.5rem !important;
        }
        .prose ol {
          list-style-type: decimal !important;
          padding-left: 1.5rem !important;
          margin-top: 0.5rem !important;
          margin-bottom: 0.5rem !important;
        }
        .prose li {
          margin-top: 0.25rem !important;
          margin-bottom: 0.25rem !important;
        }
      `}</style>

      <div className="flex gap-1 p-2 bg-gray-50 border border-gray-200 border-b-0 rounded-t-lg opacity-80 group-focus-within:opacity-100 transition-opacity">
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleBold().run()}
          className={`p-2 rounded hover:bg-gray-200 transition ${editor.isActive('bold') ? 'bg-gray-200 text-brand-true-maroon' : 'text-gray-600'}`}
        >
          <Bold size={18} />
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleItalic().run()}
          className={`p-2 rounded hover:bg-gray-200 transition ${editor.isActive('italic') ? 'bg-gray-200 text-brand-true-maroon' : 'text-gray-600'}`}
        >
          <Italic size={18} />
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleStrike().run()}
          className={`p-2 rounded hover:bg-gray-200 transition ${editor.isActive('strike') ? 'bg-gray-200 text-brand-true-maroon' : 'text-gray-600'}`}
        >
          <Strikethrough size={18} />
        </button>
        <div className="w-px h-6 bg-gray-300 self-center mx-2"></div>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          className={`p-2 rounded hover:bg-gray-200 transition ${editor.isActive('bulletList') ? 'bg-gray-200 text-brand-true-maroon' : 'text-gray-600'}`}
        >
          <List size={18} />
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          className={`p-2 rounded hover:bg-gray-200 transition ${editor.isActive('orderedList') ? 'bg-gray-200 text-brand-true-maroon' : 'text-gray-600'}`}
        >
          <ListOrdered size={18} />
        </button>
      </div>
      <div className="relative flex-grow">
        {editor.isEmpty && (
          <div className="absolute inset-0 p-6 text-gray-400/70 pointer-events-none prose prose-sm sm:prose lg:prose-lg max-w-none">
            <p>Good evening Toastmasters,</p>
            <p>The theme for this week is: <strong>[THEME]</strong>!</p>
            <p>Please review the attached agenda. If you cannot attend, please reply to this email to let us know immediately.</p>
            <p>Best,<br/>Toastmaster</p>
          </div>
        )}
        <EditorContent editor={editor} className="h-full" />
      </div>
    </div>
  )
}
