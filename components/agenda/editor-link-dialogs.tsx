/**
 * Link and Link-Card Dialogs for the email editor.
 *
 * LinkDialog turns the selected text into a link (or inserts a new one at the
 * cursor). EmbedDialog fetches a page's preview through `loadPreview` — a
 * server action, since the browser can't read other sites — and inserts it
 * as a LinkPreviewCard, the email-safe form of an embed.
 */
'use client'

import { useEffect, useRef, useState } from 'react'
import type { Editor } from '@tiptap/react'
import { DOMSerializer } from '@tiptap/pm/model'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label, FieldHint } from '@/components/ui/label'
import { FormError, Spinner } from '@/components/common/surfaces'
import { normalizeLinkHref, normalizeWebUrl } from '@/lib/web-url'
import type { ActionResult } from '@/lib/action-result'
import type { LinkPreview } from '@/lib/link-preview'
import { linkPreviewSpec, type LinkPreviewAttrs } from './link-preview-node'

export type LoadPreview = (url: string) => Promise<ActionResult<{ preview: LinkPreview }>>

/** Inserts `text` linked to `href` at the cursor, followed by an unlinked space so typing doesn't extend the link. */
function insertLinkedText(editor: Editor, text: string, href: string) {
  editor.chain().focus().insertContent([
    { type: 'text', text, marks: [{ type: 'link', attrs: { href } }] },
    { type: 'text', text: ' ' },
  ]).run()
}

export function LinkDialog({ editor, open, onOpenChange }: {
  editor: Editor
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        {/* Mounted only while open, so every opening starts from fresh fields. */}
        {open && <LinkForm editor={editor} close={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  )
}

function LinkForm({ editor, close }: { editor: Editor; close: () => void }) {
  const editing = editor.isActive('link')
  const hasSelection = !editor.state.selection.empty

  // Prefilled when the cursor is on a link.
  const [url, setUrl] = useState(() => (editing ? String(editor.getAttributes('link').href ?? '') : ''))
  const [text, setText] = useState('')
  const [error, setError] = useState<string | null>(null)

  const apply = (e: React.FormEvent) => {
    e.preventDefault()
    const href = normalizeLinkHref(url)
    if (!href) {
      setError('Enter a web address (like example.com/page) or an email address.')
      return
    }
    if (editing || hasSelection) {
      editor.chain().focus().extendMarkRange('link').setLink({ href }).run()
    } else {
      insertLinkedText(editor, text.trim() || url.trim(), href)
    }
    close()
  }

  const remove = () => {
    editor.chain().focus().extendMarkRange('link').unsetLink().run()
    close()
  }

  return (
    <form onSubmit={apply} className="grid gap-4">
      <DialogHeader>
        <DialogTitle>{editing ? 'Edit link' : 'Add a link'}</DialogTitle>
        <DialogDescription>
          {editing || hasSelection ? 'The selected text will link to this address.' : 'The link is added where the cursor is.'}
        </DialogDescription>
      </DialogHeader>
      <div>
        <Label htmlFor="editor-link-url">Address</Label>
        <Input id="editor-link-url" autoFocus value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://example.com/page" aria-invalid={!!error} />
      </div>
      {!editing && !hasSelection && (
        <div>
          <Label htmlFor="editor-link-text">Text to show</Label>
          <Input id="editor-link-text" value={text} onChange={(e) => setText(e.target.value)} placeholder="e.g., Sign up here" />
          <FieldHint>Leave blank to show the address itself.</FieldHint>
        </div>
      )}
      {error && <FormError>{error}</FormError>}
      <DialogFooter>
        {editing && <Button type="button" variant="ghost" onClick={remove}>Remove link</Button>}
        <Button type="button" variant="outline" onClick={close}>Cancel</Button>
        <Button type="submit">{editing ? 'Save link' : 'Add link'}</Button>
      </DialogFooter>
    </form>
  )
}

/** Renders the card exactly as linkPreviewSpec builds it, so the preview is what gets sent. */
function CardPreview({ attrs }: { attrs: LinkPreviewAttrs }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!ref.current) return
    ref.current.replaceChildren(DOMSerializer.renderSpec(document, linkPreviewSpec(attrs)).dom)
  }, [attrs])
  return <div ref={ref} className="pointer-events-none" />
}

export function EmbedDialog({ editor, open, onOpenChange, loadPreview }: {
  editor: Editor
  open: boolean
  onOpenChange: (open: boolean) => void
  loadPreview: LoadPreview
}) {
  // Lifted out of the form so the dialog can't be dismissed mid-fetch.
  const [loading, setLoading] = useState(false)
  return (
    <Dialog open={open} onOpenChange={(next) => !loading && onOpenChange(next)}>
      <DialogContent className="sm:max-w-xl">
        {/* Mounted only while open, so every opening starts empty. */}
        {open && (
          <EmbedForm editor={editor} close={() => onOpenChange(false)} loadPreview={loadPreview} loading={loading} setLoading={setLoading} />
        )}
      </DialogContent>
    </Dialog>
  )
}

function EmbedForm({ editor, close, loadPreview, loading, setLoading }: {
  editor: Editor
  close: () => void
  loadPreview: LoadPreview
  loading: boolean
  setLoading: (loading: boolean) => void
}) {
  const [url, setUrl] = useState('')
  const [card, setCard] = useState<LinkPreviewAttrs | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!normalizeWebUrl(url)) {
      setError('Enter a full web address, like https://example.com/page.')
      return
    }
    setLoading(true)
    setError(null)
    setCard(null)
    try {
      const result = await loadPreview(url)
      if (result.success) {
        const p = result.preview
        setCard({ href: p.url, title: p.title, description: p.description, image: p.image, siteName: p.siteName })
      } else {
        setError(result.error)
      }
    } catch {
      setError('Network error: the preview could not be loaded.')
    } finally {
      setLoading(false)
    }
  }

  const insertCard = () => {
    if (!card) return
    editor.chain().focus().insertContent({ type: 'linkPreview', attrs: card }).run()
    close()
  }

  const insertPlainLink = () => {
    const href = normalizeWebUrl(url)
    if (!href) return
    insertLinkedText(editor, url.trim(), href)
    close()
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Embed a link</DialogTitle>
        <DialogDescription>
          Adds a clickable card with the page&apos;s picture, title and summary — the way a YouTube video or news story
          shows up when shared. Email can&apos;t play videos inside the message, so the card opens the page.
        </DialogDescription>
      </DialogHeader>
      <form onSubmit={load} className="flex gap-2">
        <Input
          aria-label="Page address"
          autoFocus
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://www.youtube.com/watch?v=…"
          aria-invalid={!!error}
        />
        <Button type="submit" variant="outline" disabled={loading || !url.trim()}>
          {loading && <Spinner />}
          {loading ? 'Loading…' : 'Preview'}
        </Button>
      </form>
      {error && (
        <div className="space-y-2">
          <FormError>{error}</FormError>
          {normalizeWebUrl(url) && (
            <Button type="button" variant="link" onClick={insertPlainLink}>Insert it as a plain link instead</Button>
          )}
        </div>
      )}
      {card && <CardPreview attrs={card} />}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={close} disabled={loading}>Cancel</Button>
        <Button type="button" onClick={insertCard} disabled={!card}>Insert card</Button>
      </DialogFooter>
    </>
  )
}
