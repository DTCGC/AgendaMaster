/**
 * Email/Password Registration (members without a Google account)
 *
 * Two stages:
 *   1. A deliberately discouraging notice the member must acknowledge —
 *      Google sign-in is the intended path and the far better experience.
 *   2. Email + password form. On success the member is signed in and sent to
 *      /complete-profile, joining the normal name → approval flow.
 */
'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { signIn } from 'next-auth/react'
import { AlertTriangle, ArrowLeft, ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { buttonVariants } from '@/components/ui/button-variants'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { FormError, Notice, Spinner } from '@/components/common/surfaces'
import { cn } from '@/lib/utils'
import { registerWithPassword } from '@/app/actions/profile'
import { isValidEmail, normalizeEmail, validateNewPassword } from '@/lib/password-rules'

export default function EmailSignup() {
  const router = useRouter()
  const [acknowledged, setAcknowledged] = useState(false)
  const [showForm, setShowForm] = useState(false)

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  if (!showForm) {
    return (
      <div className="w-full space-y-5">
        <Notice tone="danger" icon={AlertTriangle} title="Please read before continuing" className="[&_li]:leading-relaxed">
          <p>
            Signing up with an email and password is <strong>not recommended</strong>, and it is <strong>not how this portal is meant to be used</strong>. It is only here for the very few members who have no way to use a Google account.
          </p>
          <p className="pt-1">Signing in with Google is <strong>much smoother</strong>:</p>
          <ul className="list-disc space-y-1 pl-5">
            <li>You won&apos;t have another password to remember.</li>
            <li>When you are Toastmaster, the agenda email goes out from your own inbox. Without Google, the club&apos;s account has to send it for you.</li>
            <li>There is no &ldquo;forgot password&rdquo; option. If you lose your password, you will need an executive&apos;s help to start over.</li>
          </ul>
        </Notice>

        <Notice tone="brand" icon={false}>
          <p>
            <strong className="text-gray-800">You don&apos;t need a Gmail address to use Google sign-in.</strong> A parent&apos;s or family member&apos;s Google account works fine — you will still enter your own name afterwards. You can also make a free Google account in a few minutes.
          </p>
        </Notice>

        <Link href="/login" className={cn(buttonVariants({ size: 'lg' }), 'h-auto min-h-12 w-full py-3 whitespace-normal text-sm')}>
          <ArrowLeft />
          Go back and sign in with Google
        </Link>

        <div className="space-y-3 border-t border-dashed border-gray-200 pt-4">
          <label className="flex cursor-pointer items-start gap-2 text-xs leading-relaxed text-gray-500 select-none">
            <input
              type="checkbox"
              checked={acknowledged}
              onChange={(e) => setAcknowledged(e.target.checked)}
              className="mt-0.5 size-4 accent-brand-loyal-blue"
            />
            I understand this is not recommended, and I have no way to use a Google account.
          </label>
          <Button variant="secondary" size="sm" className="w-full" disabled={!acknowledged} onClick={() => setShowForm(true)}>
            Continue without Google
          </Button>
        </div>
      </div>
    )
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()

    const cleanEmail = normalizeEmail(email)
    if (!isValidEmail(cleanEmail)) {
      setError('Please enter a valid email address.')
      return
    }
    const passwordError = validateNewPassword(password)
    if (passwordError) {
      setError(passwordError)
      return
    }
    if (password !== confirmPassword) {
      setError('The two passwords do not match.')
      return
    }

    setSubmitting(true)
    setError('')
    try {
      const formData = new FormData()
      formData.set('email', cleanEmail)
      formData.set('password', password)
      formData.set('confirmPassword', confirmPassword)
      const result = await registerWithPassword(formData)

      if (!result.success) {
        setError(result.error || 'Something went wrong. Please try again.')
        setSubmitting(false)
        return
      }

      const login = await signIn('credentials', { email: cleanEmail, password, redirect: false })
      if (login?.error) {
        // The account exists; only the automatic sign-in failed.
        setError('Your account was created, but we could not sign you in. Please sign in from the login page.')
        setSubmitting(false)
        return
      }

      router.push('/complete-profile')
      router.refresh()
    } catch {
      setError('Something went wrong. Please try again.')
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="w-full space-y-5">
      <div>
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          type="email"
          required
          autoFocus
          autoComplete="email"
          value={email}
          onChange={(e) => { setEmail(e.target.value); setError('') }}
          placeholder="you@example.com"
        />
      </div>

      <div>
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          type="password"
          required
          autoComplete="new-password"
          value={password}
          onChange={(e) => { setPassword(e.target.value); setError('') }}
          placeholder="At least 8 characters"
        />
      </div>

      <div>
        <Label htmlFor="confirmPassword">Confirm password</Label>
        <Input
          id="confirmPassword"
          type="password"
          required
          autoComplete="new-password"
          value={confirmPassword}
          onChange={(e) => { setConfirmPassword(e.target.value); setError('') }}
        />
      </div>

      {error && <FormError>{error}</FormError>}

      <p className="text-center text-xs leading-relaxed text-gray-500">
        Next, you&apos;ll enter your name. An executive will then review your request.
      </p>

      <Button type="submit" size="lg" disabled={submitting} className="w-full">
        {submitting ? (
          <><Spinner /> Creating account…</>
        ) : (
          <>Create Account <ArrowRight /></>
        )}
      </Button>

      <p className="text-center">
        <Link href="/login" className="text-xs text-gray-500 underline hover:text-brand-loyal-blue">
          Changed your mind? Sign in with Google instead
        </Link>
      </p>
    </form>
  )
}
