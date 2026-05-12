/**
 * Admin Broadcast Page (Server Wrapper)
 *
 * Gate-checks admin authorization, then renders the CommsClient component.
 * The actual email composition logic lives in comms-client.tsx.
 */
import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import CommsClient from './comms-client'

export const metadata = {
  title: 'Network Comms - DTCGC',
}

export default async function CommsPage() {
  const session = await auth()
  
  if (session?.user?.role !== 'ADMIN') {
    redirect('/agenda')
  }

  return (
    <div className="flex-1 p-8 bg-brand-cool-grey/10 min-h-screen">
      <div className="max-w-6xl mx-auto space-y-8">
        <div className="flex flex-col border-b pb-4">
          <h1 className="text-3xl font-extrabold text-brand-loyal-blue tracking-tight">Mass Broadcast</h1>
          <p className="text-gray-600">Dispatch centralized club communications to targeted segments.</p>
        </div>

        <CommsClient />
      </div>
    </div>
  )
}
