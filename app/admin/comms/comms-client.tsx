/**
 * Mass Broadcast Client Component
 *
 * Admin-facing rich email composition interface with target group selection.
 * Supports three delivery targets: Active Members, Guest Subscribers, or All.
 * Includes a clipboard fallback for sending the message by hand.
 */
'use client'

import { useState } from 'react'
import TiptapEditor from '@/components/agenda/tiptap-editor'
import { dispatchMassComms } from '@/app/actions/comms'
import { Megaphone, Send, Users, Globe, Copy, CheckCircle2, type LucideIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardHeader, Notice, Spinner } from '@/components/common/surfaces'
import { cn } from '@/lib/utils'

type Target = 'MEMBERS' | 'SUBSCRIBERS' | 'ALL'

const TARGETS: { value: Target; label: string; hint: string; icon: LucideIcon }[] = [
    { value: 'MEMBERS', label: 'Active Members', hint: 'Everyone with an approved account, including executives', icon: Users },
    { value: 'SUBSCRIBERS', label: 'Guest Subscribers', hint: 'The public guest mailing list', icon: Globe },
    { value: 'ALL', label: 'Everyone', hint: 'Members and guests together', icon: Megaphone },
]

export default function CommsClient() {
    const [subject, setSubject] = useState('')
    const [htmlBody, setHtmlBody] = useState('')
    const [targetGroup, setTargetGroup] = useState<Target>('MEMBERS')
    const [isDispatching, setIsDispatching] = useState(false)
    const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null)
    const [copied, setCopied] = useState(false)

    const handleDispatch = async () => {
        if (!subject.trim() || !htmlBody.trim()) {
            setResult({ ok: false, text: 'Add a subject and a message first.' });
            return;
        }

        setIsDispatching(true);
        setResult(null);

        try {
            const outcome = await dispatchMassComms(subject, htmlBody, targetGroup);
            setResult(outcome.success
                ? { ok: true, text: `Sent to ${outcome.recipientCount} recipients.` }
                : { ok: false, text: outcome.error });
        } catch {
            setResult({ ok: false, text: 'Network error: the email may not have been sent. Check your connection and try again.' });
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
                        />
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

                    <div className="space-y-3 border-t border-gray-200 pt-6">
                        <Button onClick={handleDispatch} disabled={isDispatching || !subject.trim()} className="w-full">
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
