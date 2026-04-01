'use client'

import { useActionState, useState, useTransition } from 'react'
import { approveAccount, rejectAccount, retryAccountEmail } from '@/app/actions/accounts'
import { Check, X, MailWarning, Loader2, AlertTriangle, RefreshCw } from 'lucide-react'

interface AccountActionButtonsProps {
  userId: string
  userName: string
}

export default function AccountActionButtons({ userId, userName }: AccountActionButtonsProps) {
  const [isPending, startTransition] = useTransition();
  const [errorModal, setErrorModal] = useState<{
    show: boolean;
    type: 'approval' | 'rejection';
    userId: string;
  } | null>(null);

  // useActionState for Approve
  const [approveState, approveAction, approveLoading] = useActionState(
    approveAccount,
    { success: false, emailError: false }
  );

  // useActionState for Reject
  const [rejectState, rejectAction, rejectLoading] = useActionState(
    rejectAccount,
    { success: false, emailError: false }
  );

  const [retrying, setRetrying] = useState(false);

  // Watch for state changes to trigger modal
  if (approveState.emailError && !errorModal && approveState.userId === userId) {
    setErrorModal({ show: true, type: 'approval', userId });
  }
  if (rejectState.emailError && !errorModal && rejectState.userId === userId) {
    setErrorModal({ show: true, type: 'rejection', userId });
  }

  const handleRetry = async () => {
    if (!errorModal) return;
    setRetrying(true);
    try {
      const result = await retryAccountEmail(errorModal.userId, errorModal.type);
      if (result.success) {
        setErrorModal(null);
        // We don't reset the action state globally, but cleaning errorModal hides the pop-up
      } else {
        alert(result.error || "Retry failed.");
      }
    } catch (e) {
      alert("System error during retry.");
    } finally {
      setRetrying(false);
    }
  };

  return (
    <>
      <div className="flex gap-2 justify-end">
        <form action={approveAction}>
            <input type="hidden" name="userId" value={userId} />
            <button 
                type="submit" 
                disabled={approveLoading || rejectLoading}
                className="bg-green-600 text-white px-4 py-2 rounded shadow-sm hover:bg-green-700 transition-colors text-xs font-bold flex items-center gap-1 disabled:opacity-50"
            >
                {approveLoading ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} 
                Approve
            </button>
        </form>
        
        <form action={rejectAction}>
            <input type="hidden" name="userId" value={userId} />
            <button 
                type="submit" 
                disabled={approveLoading || rejectLoading}
                className="border border-red-200 text-red-600 px-4 py-2 rounded hover:bg-red-50 transition-colors text-xs font-bold flex items-center gap-1 disabled:opacity-50"
            >
                {rejectLoading ? <Loader2 size={14} className="animate-spin" /> : <X size={14} />} 
                Deny
            </button>
        </form>
      </div>

      {/* Email Error Modal */}
      {errorModal?.show && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <div 
                className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300" 
                onClick={() => setErrorModal(null)}
            />
            <div className="relative bg-white rounded-2xl shadow-2xl max-w-sm w-full overflow-hidden animate-in fade-in zoom-in duration-200">
                <div className={`bg-brand-true-maroon p-8 text-white text-center`}>
                    <div className="mx-auto w-20 h-20 bg-white/20 rounded-full flex items-center justify-center mb-4 border-2 border-white/30 animate-pulse">
                        <MailWarning size={40} />
                    </div>
                    <h2 className="text-2xl font-black tracking-tight">Notification Failed</h2>
                    <p className="text-xs opacity-90 mt-2 leading-relaxed">
                        The {errorModal.type === 'approval' ? 'approval' : 'rejection'} was processed, but the automated email to <strong className="underline">{userName}</strong> could not be delivered.
                    </p>
                </div>
                
                <div className="p-8 space-y-4">
                    <div className="flex items-start gap-3 bg-red-50 p-4 rounded-xl border border-red-100 italic text-[11px] text-red-700">
                        <AlertTriangle size={24} className="shrink-0" />
                        <p>This is usually due to a temporary SMTP timeout or an invalid recipient address. Please retry or contact the VP Education.</p>
                    </div>

                    <div className="pt-2 space-y-3">
                        <button 
                            onClick={handleRetry}
                            disabled={retrying}
                            className="w-full bg-brand-loyal-blue py-4 rounded-xl font-black text-white shadow-lg hover:bg-brand-loyal-blue/90 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                        >
                            {retrying ? <Loader2 size={18} className="animate-spin" /> : <RefreshCw size={18} />}
                            Retry Notification
                        </button>
                        <button 
                            onClick={() => setErrorModal(null)}
                            disabled={retrying}
                            className="w-full py-3 rounded-xl font-bold text-gray-400 hover:text-gray-600 hover:bg-gray-50 transition-all flex items-center justify-center gap-1 text-sm"
                        >
                            <X size={16} /> Acknowledge & Skip
                        </button>
                    </div>
                </div>
            </div>
        </div>
      )}
    </>
  )
}
