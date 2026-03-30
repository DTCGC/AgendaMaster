'use client'

import { useState } from 'react'
import { subscribeGuest } from '@/app/actions/accounts'
import { CheckCircle2, Send } from 'lucide-react'

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
            setMessage(result.error || "Something went wrong.")
        }
    }

    if (status === 'success') {
        return (
            <div className="flex items-center gap-2 text-green-600 bg-green-50 px-4 py-2 rounded-lg border border-green-100 animate-in fade-in zoom-in duration-300">
                <CheckCircle2 size={16} />
                <span className="text-sm font-medium">{message}</span>
            </div>
        )
    }

    return (
        <div className="space-y-3">
            <p className="text-[10px] text-gray-400 uppercase font-bold tracking-widest text-center">Guest Mailing List</p>
            <form onSubmit={handleSubmit} className="flex gap-2">
                <input 
                    type="email" 
                    placeholder="Guest Email Address" 
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="flex-1 bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-brand-loyal-blue/20 outline-none transition"
                />
                <button 
                    disabled={status === 'loading'}
                    className="bg-gray-100 hover:bg-gray-200 text-gray-600 px-3 py-2 rounded-lg transition-colors flex items-center justify-center"
                >
                    <Send size={14} className={status === 'loading' ? 'animate-pulse' : ''} />
                </button>
            </form>
            {status === 'error' && <p className="text-[10px] text-red-500 font-bold text-center">{message}</p>}
        </div>
    )
}
