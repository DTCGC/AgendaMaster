/**
 * The centred card used by every sign-in-flow page: login, sign-up,
 * complete-profile and pending. One logo size, title style and card shape.
 */
import Image from "next/image"
import { LogOut, type LucideIcon } from "lucide-react"
import { signOut } from "@/auth"
import { Button } from "@/components/ui/button"
import { IconDisc } from "@/components/common/surfaces"
import { cn } from "@/lib/utils"

/** Full-height grey backdrop that centres an <AuthCard>. */
export function AuthPage({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-1 items-center justify-center bg-brand-cool-grey/20 px-4 py-12">{children}</div>
}

export function AuthCard({ title, description, icon, width = "sm", children, className }: {
  title: React.ReactNode
  description?: React.ReactNode
  /** Shown instead of the club logo (e.g. a clock on the pending page). */
  icon?: LucideIcon
  width?: "sm" | "md"
  children?: React.ReactNode
  className?: string
}) {
  return (
    <div
      data-shot="auth-card"
      className={cn(
        "w-full rounded-2xl border border-gray-100 bg-white p-8 shadow-lg",
        width === "sm" ? "max-w-sm" : "max-w-md",
        className
      )}
    >
      <div className="flex flex-col items-center text-center">
        {icon ? (
          <IconDisc icon={icon} size="lg" className="mb-6" />
        ) : (
          <Image
            src="/assets/images/LoyalBlue/GavelClubLogoLoyalBlue-RGB.png"
            alt="Downtown Coquitlam Gavel Club"
            width={1140}
            height={1140}
            priority
            sizes="80px"
            className="mb-6 h-auto w-20"
          />
        )}
        <h1 className="text-2xl font-black uppercase tracking-tight text-brand-loyal-blue">{title}</h1>
        {description && <div className="mt-2 text-sm leading-relaxed text-gray-500">{description}</div>}
      </div>
      {children && <div className="mt-8">{children}</div>}
    </div>
  )
}

/** Sign-out for the holding pages (complete-profile, pending). */
export function SignOutForm({ className }: { className?: string }) {
  return (
    <form
      className={cn("flex justify-center", className)}
      action={async () => {
        "use server"
        await signOut({ redirectTo: "/" })
      }}
    >
      <Button type="submit" variant="ghost" size="sm">
        <LogOut /> Sign Out
      </Button>
    </form>
  )
}
