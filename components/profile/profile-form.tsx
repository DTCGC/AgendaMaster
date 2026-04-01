'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { completeProfile } from '@/app/actions/profile'
import { ArrowRight, AlertCircle } from 'lucide-react'

/**
 * Client form for new members to enter their real name.
 * Validates input before submitting to the completeProfile server action.
 * Handles navigation client-side to avoid redirect() errors from server actions.
 */
export default function ProfileForm() {
  const router = useRouter();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const namePattern = /^[a-zA-Z\s\-']+$/;

  function validate(): boolean {
    const fn = firstName.trim();
    const ln = lastName.trim();
    
    if (!fn || !ln) {
      setError('Both first and last name are required.');
      return false;
    }

    if (!namePattern.test(fn) || !namePattern.test(ln)) {
      setError('Names may only contain letters, spaces, hyphens, and apostrophes.');
      return false;
    }

    if (fn.length < 2 || ln.length < 2) {
      setError('Names must be at least 2 characters.');
      return false;
    }

    setError('');
    return true;
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!validate()) return;

    setSubmitting(true);
    try {
      const formData = new FormData();
      formData.set('firstName', firstName.trim());
      formData.set('lastName', lastName.trim());
      const result = await completeProfile(formData);

      if (result.success) {
        // Navigate client-side to avoid redirect() issues in server actions
        router.push('/pending');
      } else {
        setError(result.error || 'Something went wrong. Please try again.');
        setSubmitting(false);
      }
    } catch (err: any) {
      setError(err.message || 'Something went wrong. Please try again.');
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div>
        <label htmlFor="firstName" className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">
          First Name
        </label>
        <input
          id="firstName"
          type="text"
          required
          autoFocus
          maxLength={50}
          value={firstName}
          onChange={(e) => { setFirstName(e.target.value); setError(''); }}
          placeholder="e.g. Sarah"
          className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 text-sm font-medium text-gray-800 placeholder:text-gray-300 focus:border-brand-loyal-blue focus:ring-2 focus:ring-brand-loyal-blue/20 outline-none transition-all"
        />
      </div>

      <div>
        <label htmlFor="lastName" className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">
          Last Name
        </label>
        <input
          id="lastName"
          type="text"
          required
          maxLength={50}
          value={lastName}
          onChange={(e) => { setLastName(e.target.value); setError(''); }}
          placeholder="e.g. Thompson"
          className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 text-sm font-medium text-gray-800 placeholder:text-gray-300 focus:border-brand-loyal-blue focus:ring-2 focus:ring-brand-loyal-blue/20 outline-none transition-all"
        />
      </div>

      {error && (
        <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-xs font-medium animate-in fade-in slide-in-from-top-1 duration-200">
          <AlertCircle size={14} className="mt-0.5 shrink-0" />
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="w-full bg-brand-loyal-blue text-white font-bold rounded-xl p-3.5 hover:bg-brand-loyal-blue/90 transition-all flex items-center justify-center gap-2 text-sm shadow-lg disabled:opacity-50 disabled:cursor-not-allowed mt-2"
      >
        {submitting ? (
          <span className="flex items-center gap-2">
            <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            Submitting…
          </span>
        ) : (
          <>
            Continue to Registration
            <ArrowRight size={16} />
          </>
        )}
      </button>
    </form>
  );
}
