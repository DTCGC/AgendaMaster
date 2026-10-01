/**
 * Account Action Buttons (Approve/Reject)
 *
 * Client-side component for the admin Accounts panel that handles
 * member approval and rejection with email notification retry logic.
 *
 * If the notification email fails, shows a modal overlay allowing
 * the admin to retry the email or acknowledge and skip.
 */
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { approveAccount, rejectAccount, retryAccountEmail } from '@/app/actions/accounts'
import { Check, X, MailWarning, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/common/confirm-dialog'
import { Notice, Spinner } from '@/components/common/surfaces'

interface AccountActionButtonsProps {
  userId: string
  userName: string
}

export default function AccountActionButtons({ userId, userName }: AccountActionButtonsProps) {
  const router = useRouter();
  
  const [approveLoading, setApproveLoading] = useState(false);
  const [rejectLoading, setRejectLoading] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [errorModal, setErrorModal] = useState<{
    show: boolean;
    type: 'approval' | 'rejection';
    userId: string;
  } | null>(null);

  const handleApprove = async () => {
    setApproveLoading(true);
    try {
      const result = await approveAccount(userId);
      if (result.emailError) {
        setErrorModal({ show: true, type: 'approval', userId });
      } else if (!result.success) {
        alert(result.error);
        router.refresh();
      } else {
        router.refresh();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setApproveLoading(false);
    }
  };

  const handleReject = async () => {
    setRejectLoading(true);
    try {
      const result = await rejectAccount(userId);
      if (result.emailError) {
        setErrorModal({ show: true, type: 'rejection', userId });
      } else if (!result.success) {
        alert(result.error);
        router.refresh();
      } else {
        router.refresh();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setRejectLoading(false);
    }
  };

  const handleSkip = () => {
    setErrorModal(null);
    router.refresh();
  };

  const handleRetry = async () => {
    if (!errorModal) return;
    setRetrying(true);
    try {
      const result = await retryAccountEmail(errorModal.userId, errorModal.type);
      if (result.success) {
        setErrorModal(null);
        router.refresh();
      } else {
        alert(result.error);
      }
    } catch {
      alert("System error during retry.");
    } finally {
      setRetrying(false);
    }
  };

  return (
    <>
      <div className="flex justify-end gap-2">
        <Button variant="success" size="sm" onClick={handleApprove} disabled={approveLoading || rejectLoading}>
          {approveLoading ? <Spinner size={14} /> : <Check />}
          Approve
        </Button>
        <Button variant="destructive-outline" size="sm" onClick={handleReject} disabled={approveLoading || rejectLoading}>
          {rejectLoading ? <Spinner size={14} /> : <X />}
          Deny
        </Button>
      </div>

      {/* Email Error Modal */}
      <ConfirmDialog
        open={!!errorModal?.show}
        onOpenChange={(open) => { if (!open) handleSkip() }}
        tone="maroon"
        icon={MailWarning}
        title="Notification Failed"
        description={errorModal && (
          <>The {errorModal.type === 'approval' ? 'approval' : 'rejection'} was processed, but the automated email to <strong className="text-white">{userName}</strong> could not be delivered.</>
        )}
        confirmLabel={<><RefreshCw /> Retry Notification</>}
        cancelLabel="Acknowledge & Skip"
        busy={retrying}
        onConfirm={handleRetry}
      >
        <Notice tone="warning">
          This is usually a temporary sending error or an invalid recipient address. Please retry, or contact the VP Education.
        </Notice>
      </ConfirmDialog>
    </>
  )
}
