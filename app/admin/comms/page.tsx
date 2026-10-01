/**
 * Admin Broadcast Page (Server Wrapper)
 *
 * Gate-checks admin authorization, then renders the CommsClient component.
 * The actual email composition logic lives in comms-client.tsx.
 */
import { pageRequireAdmin } from '@/lib/auth-guard'
import { PageShell, PageHeader } from '@/components/common/page'
import CommsClient from './comms-client'

export const metadata = {
  title: 'Mass Broadcast - DTCGC',
}

export default async function CommsPage() {
  await pageRequireAdmin()

  return (
    <PageShell width="6xl">
      <PageHeader
        title="Mass Broadcast"
        description="Email the whole club, the guest mailing list, or both."
      />
      <CommsClient />
    </PageShell>
  )
}
