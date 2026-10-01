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
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { FormError, Spinner } from '@/components/common/surfaces'

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
        <form onSubmit={handleSubmit} className="w-full space-y-3">
            <p className="mb-4 text-center text-xs leading-relaxed text-gray-500">
                For executives, and members who registered without a Google account.
            </p>

            {error && <FormError>{error}</FormError>}

            <div>
                <Label htmlFor="login-email" className="sr-only">Email</Label>
                <Input
                    id="login-email"
                    name="email"
                    type="email"
                    placeholder="Email"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                />
            </div>
            <div>
                <Label htmlFor="login-password" className="sr-only">Password</Label>
                <Input
                    id="login-password"
                    name="password"
                    type="password"
                    placeholder="Password"
                    autoComplete="current-password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                />
            </div>
            <Button type="submit" disabled={isLoading} className="w-full">
                {isLoading && <Spinner />}
                {isLoading ? 'Signing in…' : 'Sign In'}
            </Button>
        </form>
    )
}
