/**
 * Email/Password Login Form
 *
 * Dual-use: the club's shared ADMIN credential, and the rare members who
 * registered without a Google account (/signup). Everyone else uses Google
 * OAuth. Uses the NextAuth Credentials provider configured in auth.ts.
 */
'use client'

import { useState } from 'react'
import { signIn } from 'next-auth/react'
import { AlertCircle } from 'lucide-react'

export default function EmailLoginForm() {
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [isLoading, setIsLoading] = useState(false)
    const [error, setError] = useState('')

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setIsLoading(true)
        setError('')

        try {
            const result = await signIn('credentials', {
                email,
                password,
                redirect: false,
            })

            if (result?.error) {
                setError('Incorrect email or password.')
                setIsLoading(false)
            } else {
                // A full navigation back to /login lets the role-based
                // redirect send each account to its own home (admins to the
                // calendar, new sign-ups to their profile or the waiting page,
                // members to their agenda) and refreshes the session everywhere.
                window.location.assign('/login')
            }
        } catch {
            setError('Sign-in failed. Please try again.')
            setIsLoading(false)
        }
    }

    return (
        <form onSubmit={handleSubmit} className="space-y-3 w-full">
            <p className="text-[10px] text-gray-400 leading-relaxed italic text-center max-w-[240px] mx-auto mb-4">
                For executives, and members who registered without a Google account.
            </p>

            {error && (
                <div className="flex items-center gap-2 text-red-600 bg-red-50 px-3 py-2 rounded-lg border border-red-100 text-xs font-medium animate-in fade-in duration-200">
                    <AlertCircle size={14} />
                    {error}
                </div>
            )}

            <div>
                <input
                    name="email"
                    type="email"
                    placeholder="Email"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full border border-gray-200 rounded-xl p-3 text-sm focus:ring-2 focus:ring-brand-loyal-blue/20 outline-none transition-all placeholder:text-gray-300"
                />
            </div>
            <div>
                <input
                    name="password"
                    type="password"
                    placeholder="Password"
                    autoComplete="current-password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full border border-gray-200 rounded-xl p-3 text-sm focus:ring-2 focus:ring-brand-loyal-blue/20 outline-none transition-all placeholder:text-gray-300"
                />
            </div>
            <button
                type="submit"
                disabled={isLoading}
                className="w-full bg-brand-loyal-blue text-white font-bold rounded-xl p-3 hover:opacity-90 transition-opacity shadow-lg shadow-brand-loyal-blue/20 text-sm disabled:opacity-50"
            >
                {isLoading ? 'Signing in...' : 'Sign In'}
            </button>
        </form>
    )
}
