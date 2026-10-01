/**
 * Confirmation dialog with a coloured header band — the look of the original
 * sign-out modal, on top of components/ui/dialog.tsx (focus trap, Escape to
 * close, ARIA roles).
 */
'use client'

import type { LucideIcon } from "lucide-react"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { IconDisc, Spinner } from "@/components/common/surfaces"
import { cn } from "@/lib/utils"

const BANDS = {
  brand: { band: "bg-brand-loyal-blue", button: "default" },
  maroon: { band: "bg-brand-true-maroon", button: "maroon" },
  danger: { band: "bg-red-700", button: "destructive" },
} as const

export function ConfirmDialog({
  open, onOpenChange, tone = "brand", icon, title, description, children,
  confirmLabel, cancelLabel = "Cancel", onConfirm, busy = false,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  tone?: keyof typeof BANDS
  icon: LucideIcon
  title: React.ReactNode
  description?: React.ReactNode
  /** Extra content between the header and the buttons. */
  children?: React.ReactNode
  confirmLabel: React.ReactNode
  cancelLabel?: React.ReactNode
  onConfirm: () => void
  busy?: boolean
}) {
  const t = BANDS[tone]
  return (
    <Dialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <DialogContent showCloseButton={false} className="gap-0 p-0">
        <div className={cn("px-6 pt-8 pb-6 text-center text-white", t.band)}>
          <IconDisc icon={icon} tone="on-brand" size="lg" className="mx-auto mb-4" />
          <DialogTitle className="text-xl font-black tracking-tight text-white">{title}</DialogTitle>
          {description && (
            <DialogDescription className="mt-2 text-sm leading-relaxed text-white/80">{description}</DialogDescription>
          )}
        </div>
        <div className="space-y-3 p-6">
          {children}
          <Button variant={t.button} size="lg" className="w-full" onClick={onConfirm} disabled={busy}>
            {busy && <Spinner size={18} />}
            {confirmLabel}
          </Button>
          <Button variant="ghost" className="w-full" onClick={() => onOpenChange(false)} disabled={busy}>
            {cancelLabel}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
