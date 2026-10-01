/**
 * Full-page status message: the 404 and error pages. Shared so both look
 * like the rest of the app (and like each other).
 */
import type { LucideIcon } from "lucide-react"
import { IconDisc } from "@/components/common/surfaces"
import { cn } from "@/lib/utils"

export function StatusPage({ icon, tone = "brand", code, title, children, actions, footer }: {
  icon: LucideIcon
  tone?: "brand" | "maroon"
  /** "404" */
  code: string
  title: string
  children: React.ReactNode
  actions: React.ReactNode
  /** Extra detail under the buttons (e.g. an error reference). */
  footer?: React.ReactNode
}) {
  return (
    <div className="flex flex-1 items-center justify-center bg-brand-cool-grey/20 px-4 py-16">
      <div className="max-w-lg space-y-6 text-center">
        <IconDisc icon={icon} tone={tone} size="xl" className="mx-auto" />
        <div>
          <p className={cn("text-7xl font-black tracking-tighter md:text-8xl", tone === "brand" ? "text-brand-loyal-blue" : "text-brand-true-maroon")}>
            {code}
          </p>
          <h1 className="mt-2 text-xl font-bold text-gray-700">{title}</h1>
        </div>
        <p className="mx-auto max-w-sm leading-relaxed text-gray-600">{children}</p>
        <div className="flex flex-col justify-center gap-3 pt-2 sm:flex-row">{actions}</div>
        {footer}
      </div>
    </div>
  )
}
