/**
 * Guest Mailing List Subscription Form
 *
 * Allows public visitors (parents, prospective members) to subscribe
 * to club communications without creating an account. Shown on the
 * login page below the main sign-in options.
 */
'use client'

import { useState } from 'react'
import { subscribeGuest } from '@/app/actions/accounts'
import { CheckCircle2, Send } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { SectionLabel } from '@/components/common/page'
import { Notice, Spinner } from '@/components/common/surfaces'

export default function GuestSubscribe() {
    const [email, setEmail] = useState('')
    const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
    const [message, setMessage] = useState('')

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!email) return
        
        setStatus('loading')
        const result = await subscribeGuest(email)
        
        if (result.success) {
            setStatus('success')
            setEmail('')
            setMessage("You've been added to our guest list!")
        } else {
            setStatus('error')
            setMessage(result.error)
        }
    }

    if (status === 'success') {
        return (
            <Notice tone="success" icon={CheckCircle2} className="animate-in fade-in duration-300">
                {message}
            </Notice>
        )
    }

    return (
        <div className="space-y-3">
            <SectionLabel as="p" className="text-center">Guest Mailing List</SectionLabel>
            <form onSubmit={handleSubmit} className="flex gap-2">
                <Label htmlFor="guest-email" className="sr-only">Guest email address</Label>
                <Input
                    id="guest-email"
                    type="email"
                    placeholder="Guest Email Address"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="flex-1"
                />
                <Button
                    type="submit"
                    variant="secondary"
                    size="icon"
                    className="size-11"
                    disabled={status === 'loading'}
                    aria-label="Subscribe"
                >
                    {status === 'loading' ? <Spinner /> : <Send />}
                </Button>
            </form>
            {status === 'error' && <p role="alert" className="text-center text-xs font-semibold text-red-600">{message}</p>}
        </div>
    )
}
