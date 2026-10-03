/**
 * Mass Broadcast Client Component
 *
 * Admin-facing rich email composition interface with target group selection.
 * Supports three delivery targets: Active Members, Guest Subscribers, or All.
 * The message can carry links, link preview cards and file attachments, and
 * the Recipients panel shows what the send costs against Resend's daily quota.
 * Includes a clipboard fallback for sending the message by hand.
 */
'use client'

import { useEffect, useRef, useState } from 'react'
import TiptapEditor from '@/components/agenda/tiptap-editor'
import { dispatchMassComms, getBroadcastAudience, getLinkPreview, type BroadcastAudience, type BroadcastTarget } from '@/app/actions/comms'
import { Megaphone, Send, Users, Globe, Copy, CheckCircle2, Paperclip, X, FileText, ImageIcon, type LucideIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label, FieldHint } from '@/components/ui/label'
import { Card, CardHeader, Notice, Spinner } from '@/components/common/surfaces'
import { checkAttachments, formatBytes, MAX_ATTACHMENT_TOTAL_BYTES } from '@/lib/email-limits'
import { cn } from '@/lib/utils'

const TARGETS: { value: BroadcastTarget; label: string; hint: string; icon: LucideIcon }[] = [
    { value: 'MEMBERS', label: 'Active Members', hint: 'Everyone with an approved account, including executives', icon: Users },
    { value: 'SUBSCRIBERS', label: 'Guest Subscribers', hint: 'The public guest mailing list', icon: Globe },
    { value: 'ALL', label: 'Everyone', hint: 'Members and guests together', icon: Megaphone },
]

/** Same file twice (picked again, or dropped after picking) is one attachment. */
const fileKey = (f: File) => `${f.name}:${f.size}:${f.lastModified}`

export default function CommsClient() {
    const [subject, setSubject] = useState('')
    const [htmlBody, setHtmlBody] = useState('')
    const [targetGroup, setTargetGroup] = useState<BroadcastTarget>('MEMBERS')
    const [files, setFiles] = useState<File[]>([])
    const [fileError, setFileError] = useState<string | null>(null)
    const [dragging, setDragging] = useState(false)
    const [audience, setAudience] = useState<BroadcastAudience | null>(null)
    const [isDispatching, setIsDispatching] = useState(false)
    const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null)
    const [copied, setCopied] = useState(false)
    const fileInput = useRef<HTMLInputElement>(null)

    // Recount whenever the group changes, and after each send (the quota moved).
    useEffect(() => {
        let cancelled = false
        getBroadcastAudience(targetGroup)
            .then((r) => { if (!cancelled) setAudience(r.success ? r.audience : null) })
            .catch(() => { if (!cancelled) setAudience(null) })
        return () => { cancelled = true }
    }, [targetGroup, result])

    const overQuota = !!audience && audience.remainingToday !== null && audience.quotaCost > audience.remainingToday
    const totalBytes = files.reduce((sum, f) => sum + f.size, 0)

    /** Adds files, refusing the whole addition if the result would break a limit. */
    const addFiles = (incoming: FileList | null) => {
        if (!incoming?.length) return
        const known = new Set(files.map(fileKey))
        const next = [...files, ...Array.from(incoming).filter((f) => !known.has(fileKey(f)))]
        const problem = checkAttachments(next)
        setFileError(problem)
        if (!problem) setFiles(next)
    }

    const removeFile = (key: string) => {
        setFiles((current) => current.filter((f) => fileKey(f) !== key))
        setFileError(null)
    }

    const handleDispatch = async () => {
        const hasText = htmlBody.replace(/<[^>]*>/g, '').trim().length > 0 || /data-link-preview/.test(htmlBody)
        if (!subject.trim() || !hasText) {
            setResult({ ok: false, text: 'Add a subject and a message first.' });
            return;
        }

        setIsDispatching(true);
        setResult(null);

        const form = new FormData();
        form.set('subject', subject);
        form.set('htmlBody', htmlBody);
        form.set('targetGroup', targetGroup);
        for (const file of files) form.append('attachments', file);

        try {
            const outcome = await dispatchMassComms(form);
            if (outcome.success) {
                const skipped = outcome.skipped > 0 ? ` ${outcome.skipped} address${outcome.skipped === 1 ? ' was' : 'es were'} skipped because they aren't valid email addresses.` : ''
                setResult({ ok: true, text: `Sent to ${outcome.recipientCount} recipients.${skipped}` })
            } else {
                setResult({ ok: false, text: outcome.error })
            }
        } catch {
            setResult({
                ok: false,
                text: files.length > 0
                    ? 'The upload failed, so the email was not sent. If this keeps happening with attachments, the server may be refusing files this large — try smaller files, or put them in Google Drive and link to them.'
                    : 'Network error: the email may not have been sent. Check your connection and try again.',
            });
        } finally {
            setIsDispatching(false);
        }
    }

    const handleCopyManual = () => {
        // Preserve line breaks: textContent alone flattens block-level HTML
        // (paragraphs, <br>, lists) into one run-on line.
        const withBreaks = htmlBody
            .replace(/<\s*br\s*\/?>/gi, "\n")
            .replace(/<\s*li[^>]*>/gi, "• ")
            .replace(/<\s*\/(p|div|h[1-6]|li|tr|blockquote)\s*>/gi, "\n");
        const tempDiv = document.createElement("div");
        tempDiv.innerHTML = withBreaks;
        const textData = (tempDiv.textContent || tempDiv.innerText || "").replace(/\n{3,}/g, "\n\n");
        navigator.clipboard.writeText(`${subject}\n\n${textData}`).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 3000);
        });
    }

    return (
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
            <Card className="lg:col-span-2">
                <CardHeader icon={Megaphone}>Compose</CardHeader>
                <div className="space-y-5 p-6">
                    <div>
                        <Label htmlFor="broadcast-subject">Subject</Label>
                        <Input
                            id="broadcast-subject"
                            type="text"
                            placeholder="e.g., Special Announcement: DTCGC Spring Contest"
                            value={subject}
                            onChange={e => setSubject(e.target.value)}
                        />
                    </div>

                    <div>
                        <Label>Message</Label>
                        <TiptapEditor
                            content={htmlBody}
                            onChange={setHtmlBody}
                            placeholder={<p>Write your club update here.</p>}
                            links
                            loadPreview={getLinkPreview}
                        />
                        <FieldHint>Use <strong>Link</strong> to link text, or <strong>Embed</strong> to show a link as a card with its picture and title.</FieldHint>
                    </div>

                    <div>
                        <Label htmlFor="broadcast-attachments">Attachments</Label>
                        <div
                            onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
                            onDragLeave={() => setDragging(false)}
                            onDrop={(e) => { e.preventDefault(); setDragging(false); addFiles(e.dataTransfer.files) }}
                            className={cn(
                                "rounded-xl border border-dashed p-4 transition-colors",
                                dragging ? "border-brand-loyal-blue bg-brand-loyal-blue/5" : "border-gray-300 bg-gray-50"
                            )}
                        >
                            <input
                                ref={fileInput}
                                id="broadcast-attachments"
                                type="file"
                                multiple
                                className="sr-only"
                                onChange={(e) => { addFiles(e.target.files); e.target.value = '' }}
                            />
                            <div className="flex flex-wrap items-center gap-3">
                                <Button type="button" variant="outline" size="sm" onClick={() => fileInput.current?.click()}>
                                    <Paperclip /> Attach files
                                </Button>
                                <span className="text-xs text-gray-500">
                                    or drop them here · photos, PDFs and documents up to {formatBytes(MAX_ATTACHMENT_TOTAL_BYTES)} in total
                                </span>
                            </div>
                            {files.length > 0 && (
                                <ul className="mt-3 space-y-2">
                                    {files.map((file) => {
                                        const key = fileKey(file)
                                        const Icon = file.type.startsWith('image/') ? ImageIcon : FileText
                                        return (
                                            <li key={key} className="flex items-center gap-3 rounded-lg border border-gray-200 bg-white px-3 py-2">
                                                <Icon size={16} className="shrink-0 text-gray-400" />
                                                <span className="min-w-0 flex-1 truncate text-sm text-gray-700">{file.name}</span>
                                                <span className="shrink-0 text-xs text-gray-500">{formatBytes(file.size)}</span>
                                                <Button type="button" variant="ghost" size="icon-sm" aria-label={`Remove ${file.name}`} onClick={() => removeFile(key)}>
                                                    <X />
                                                </Button>
                                            </li>
                                        )
                                    })}
                                    <li className="text-right text-xs text-gray-500">
                                        {formatBytes(totalBytes)} of {formatBytes(MAX_ATTACHMENT_TOTAL_BYTES)}
                                    </li>
                                </ul>
                            )}
                        </div>
                        {fileError && <Notice tone="danger" className="mt-2">{fileError}</Notice>}
                    </div>
                </div>
            </Card>

            <Card className="h-fit">
                <CardHeader icon={Send}>Recipients</CardHeader>
                <div className="space-y-6 p-6">
                    <fieldset className="space-y-2">
                        <legend className="sr-only">Send to</legend>
                        {TARGETS.map(({ value, label, hint, icon: Icon }) => {
                            const selected = targetGroup === value
                            return (
                                <label
                                    key={value}
                                    className={cn(
                                        "flex cursor-pointer items-center gap-3 rounded-xl border p-3 transition-colors",
                                        selected ? "border-brand-loyal-blue bg-brand-loyal-blue/5" : "border-gray-200 hover:bg-gray-50"
                                    )}
                                >
                                    <input
                                        type="radio"
                                        name="target"
                                        value={value}
                                        className="size-4 accent-brand-loyal-blue"
                                        checked={selected}
                                        onChange={() => setTargetGroup(value)}
                                    />
                                    <Icon size={18} className={selected ? 'text-brand-loyal-blue' : 'text-gray-400'} />
                                    <span className="flex flex-col">
                                        <span className="text-sm font-semibold text-gray-800">{label}</span>
                                        <span className="text-xs text-gray-500">{hint}</span>
                                    </span>
                                </label>
                            )
                        })}
                    </fieldset>

                    {audience && (
                        <div className="space-y-2">
                            <p className="text-sm text-gray-700">
                                <strong>{audience.recipientCount}</strong> recipient{audience.recipientCount === 1 ? '' : 's'}
                                {audience.remainingToday !== null && (
                                    <span className="text-gray-500"> · uses {audience.quotaCost} of the {audience.remainingToday} emails left today</span>
                                )}
                            </p>
                            {overQuota && (
                                <Notice tone="warning">
                                    {audience.dailyLimit !== null && audience.quotaCost > audience.dailyLimit
                                        ? `Resend's plan sends at most ${audience.dailyLimit} emails a day, and each recipient counts as one, so this group is too big to email in one day. Choose a smaller group.`
                                        : `Not enough of today's allowance is left for this group. It resets at ${audience.resetsAt} (Pacific).`}
                                </Notice>
                            )}
                        </div>
                    )}

                    <div className="space-y-3 border-t border-gray-200 pt-6">
                        <Button onClick={handleDispatch} disabled={isDispatching || !subject.trim() || overQuota} className="w-full">
                            {isDispatching ? <Spinner /> : <Send />}
                            {isDispatching ? 'Sending…' : 'Send Email'}
                        </Button>

                        <Button variant="secondary" onClick={handleCopyManual} className="w-full">
                            {copied ? <CheckCircle2 className="text-green-600" /> : <Copy />}
                            {copied ? 'Copied to Clipboard' : 'Copy as Text'}
                        </Button>

                        {result && (
                            <Notice tone={result.ok ? 'success' : 'danger'}>{result.text}</Notice>
                        )}
                    </div>
                </div>
            </Card>
        </div>
    )
}
