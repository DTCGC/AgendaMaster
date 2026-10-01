/**
 * New Member Profile Form
 *
 * Client-side form for the profile completion flow. Collects first
 * and last name with validation, then calls the completeProfile
 * server action to transition INCOMPLETE → PENDING.
 */
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { completeProfile } from '@/app/actions/profile'
import { validatePersonName } from '@/lib/name-rules'
import { ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { FormError, Spinner } from '@/components/common/surfaces'

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

  function validate(): boolean {
    const problem = validatePersonName(firstName, lastName);
    setError(problem ?? '');
    return !problem;
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
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Something went wrong. Please try again.'
      setError(message);
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div>
        <Label htmlFor="firstName">First name</Label>
        <Input
          id="firstName"
          type="text"
          required
          autoFocus
          maxLength={50}
          autoComplete="given-name"
          value={firstName}
          onChange={(e) => { setFirstName(e.target.value); setError(''); }}
          placeholder="e.g. Sarah"
        />
      </div>

      <div>
        <Label htmlFor="lastName">Last name</Label>
        <Input
          id="lastName"
          type="text"
          required
          maxLength={50}
          autoComplete="family-name"
          value={lastName}
          onChange={(e) => { setLastName(e.target.value); setError(''); }}
          placeholder="e.g. Thompson"
        />
      </div>

      {error && <FormError>{error}</FormError>}

      <Button type="submit" size="lg" disabled={submitting} className="w-full">
        {submitting ? (
          <><Spinner /> Submitting…</>
        ) : (
          <>Continue to Registration <ArrowRight /></>
        )}
      </Button>
    </form>
  );
}
