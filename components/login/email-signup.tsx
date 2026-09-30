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
import { AlertTriangle, AlertCircle, ArrowLeft, ArrowRight } from 'lucide-react'
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
        <div className="w-full bg-red-50 border-2 border-red-200 rounded-xl p-4 space-y-3">
          <div className="flex items-center gap-2 text-red-700">
            <AlertTriangle size={18} className="shrink-0" />
            <h2 className="text-sm font-black uppercase tracking-wide">Please read before continuing</h2>
          </div>
          <p className="text-xs text-red-900 leading-relaxed">
            Signing up with an email and password is <strong>not recommended</strong>, and it is <strong>not how this portal is meant to be used</strong>. It is only here for the very few members who have no way to use a Google account.
          </p>
          <p className="text-xs text-red-900 leading-relaxed">
            Signing in with Google is <strong>much smoother</strong>:
          </p>
          <ul className="text-xs text-red-900 leading-relaxed list-disc pl-5 space-y-1">
            <li>You won&apos;t have another password to remember.</li>
            <li>When you are Toastmaster, the agenda email goes out from your own inbox. Without Google, the club&apos;s account has to send it for you.</li>
            <li>There is no &ldquo;forgot password&rdquo; option. If you lose your password, you will need an executive&apos;s help to start over.</li>
          </ul>
        </div>

        <div className="w-full bg-brand-loyal-blue/5 border border-brand-loyal-blue/20 rounded-xl p-4">
          <p className="text-xs text-gray-700 leading-relaxed">
            <strong>You don&apos;t need a Gmail address to use Google sign-in.</strong> A parent&apos;s or family member&apos;s Google account works fine — you will still enter your own name afterwards. You can also make a free Google account in a few minutes.
          </p>
        </div>

        <Link
          href="/login"
          className="w-full bg-brand-loyal-blue text-white font-bold rounded-xl p-3.5 hover:bg-brand-loyal-blue/90 transition-all flex items-center justify-center gap-2 text-sm shadow-lg"
        >
          <ArrowLeft size={16} />
          Go back and sign in with Google
        </Link>

        <div className="pt-4 border-t border-dashed space-y-3">
          <label className="flex items-start gap-2 text-[11px] text-gray-500 leading-relaxed cursor-pointer select-none">
            <input
              type="checkbox"
              checked={acknowledged}
              onChange={(e) => setAcknowledged(e.target.checked)}
              className="mt-0.5 accent-brand-loyal-blue"
            />
            I understand this is not recommended, and I have no way to use a Google account.
          </label>
          <button
            type="button"
            disabled={!acknowledged}
            onClick={() => setShowForm(true)}
            className="w-full text-xs font-bold text-gray-500 border border-gray-200 rounded-xl p-2.5 hover:bg-gray-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Continue without Google
          </button>
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

  const inputClass =
    'w-full border-2 border-gray-200 rounded-xl px-4 py-3 text-sm font-medium text-gray-800 placeholder:text-gray-300 focus:border-brand-loyal-blue focus:ring-2 focus:ring-brand-loyal-blue/20 outline-none transition-all'

  return (
    <form onSubmit={handleSubmit} className="w-full space-y-5">
      <div>
        <label htmlFor="email" className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">
          Email
        </label>
        <input
          id="email"
          type="email"
          required
          autoFocus
          autoComplete="email"
          value={email}
          onChange={(e) => { setEmail(e.target.value); setError('') }}
          placeholder="you@example.com"
          className={inputClass}
        />
      </div>

      <div>
        <label htmlFor="password" className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">
          Password
        </label>
        <input
          id="password"
          type="password"
          required
          autoComplete="new-password"
          value={password}
          onChange={(e) => { setPassword(e.target.value); setError('') }}
          placeholder="At least 8 characters"
          className={inputClass}
        />
      </div>

      <div>
        <label htmlFor="confirmPassword" className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">
          Confirm Password
        </label>
        <input
          id="confirmPassword"
          type="password"
          required
          autoComplete="new-password"
          value={confirmPassword}
          onChange={(e) => { setConfirmPassword(e.target.value); setError('') }}
          className={inputClass}
        />
      </div>

      {error && (
        <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-xs font-medium animate-in fade-in slide-in-from-top-1 duration-200">
          <AlertCircle size={14} className="mt-0.5 shrink-0" />
          {error}
        </div>
      )}

      <p className="text-[11px] text-gray-400 leading-relaxed text-center">
        Next, you&apos;ll enter your name. An executive will then review your request.
      </p>

      <button
        type="submit"
        disabled={submitting}
        className="w-full bg-brand-loyal-blue text-white font-bold rounded-xl p-3.5 hover:bg-brand-loyal-blue/90 transition-all flex items-center justify-center gap-2 text-sm shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {submitting ? (
          <span className="flex items-center gap-2">
            <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            Creating account…
          </span>
        ) : (
          <>
            Create Account
            <ArrowRight size={16} />
          </>
        )}
      </button>

      <p className="text-center">
        <Link href="/login" className="text-[11px] text-gray-400 hover:text-brand-loyal-blue underline">
          Changed your mind? Sign in with Google instead
        </Link>
      </p>
    </form>
  )
}
