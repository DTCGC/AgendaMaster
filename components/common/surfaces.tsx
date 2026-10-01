/**
 * Surfaces: cards, notices, badges, empty states and icon discs.
 *
 * Modelled on the /tutorial page's building blocks (components/tutorial/
 * blocks.tsx), so the rest of the app reads like the same product.
 */
import { AlertCircle, AlertTriangle, CheckCircle2, Info, Loader2, type LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"

/** White content card. Add padding with className, or use <CardHeader> + a padded body. */
export function Card({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm", className)} {...props} />
}

/** Grey title strip at the top of a <Card>. */
export function CardHeader({ icon: Icon, children, actions, className }: {
  icon?: LucideIcon
  children: React.ReactNode
  actions?: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn("flex items-center justify-between gap-3 border-b border-gray-200 bg-gray-50 px-5 py-3", className)}>
      <h2 className="flex items-center gap-2 text-sm font-bold text-gray-700">
        {Icon && <Icon size={16} className="text-brand-loyal-blue" />}
        {children}
      </h2>
      {actions}
    </div>
  )
}

const NOTICE_TONES = {
  /** Neutral information in the club's colour. */
  brand: { box: "border-brand-loyal-blue/20 bg-brand-loyal-blue/5 text-gray-700", title: "text-brand-loyal-blue", icon: Info, iconColor: "text-brand-loyal-blue" },
  /** Something to do, for the person reading (the Toastmaster's call to action). */
  highlight: { box: "border-brand-happy-yellow bg-brand-happy-yellow/15 text-gray-700", title: "text-gray-800", icon: Info, iconColor: "text-brand-loyal-blue" },
  warning: { box: "border-amber-200 bg-amber-50 text-amber-900", title: "text-amber-900", icon: AlertTriangle, iconColor: "text-amber-600" },
  danger: { box: "border-red-200 bg-red-50 text-red-800", title: "text-red-800", icon: AlertCircle, iconColor: "text-red-600" },
  success: { box: "border-green-200 bg-green-50 text-green-800", title: "text-green-800", icon: CheckCircle2, iconColor: "text-green-600" },
} as const

/** A boxed message. The one style for every info/warning/error box in the app. */
export function Notice({ tone = "brand", title, icon, children, className, ...props }: {
  tone?: keyof typeof NOTICE_TONES
  title?: React.ReactNode
  /** Override the tone's icon, or pass false for none. */
  icon?: LucideIcon | false
} & Omit<React.ComponentProps<"div">, "title">) {
  const t = NOTICE_TONES[tone]
  const Icon = icon === false ? null : icon ?? t.icon
  return (
    <div
      role={tone === "danger" ? "alert" : undefined}
      className={cn("flex gap-3 rounded-xl border p-4 text-sm leading-relaxed", t.box, className)}
      {...props}
    >
      {Icon && <Icon size={20} className={cn("mt-px shrink-0", t.iconColor)} />}
      <div className="min-w-0 flex-1 space-y-1">
        {title && <p className={cn("font-bold", t.title)}>{title}</p>}
        {children}
      </div>
    </div>
  )
}

/** Inline form error ("The two passwords do not match."). */
export function FormError({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <p role="alert" className={cn("flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-medium text-red-700", className)}>
      <AlertCircle size={16} className="mt-0.5 shrink-0" />
      <span>{children}</span>
    </p>
  )
}

const BADGE_TONES = {
  neutral: "border-gray-200 bg-gray-100 text-gray-600",
  brand: "border-brand-loyal-blue/20 bg-brand-loyal-blue/10 text-brand-loyal-blue",
  maroon: "border-brand-true-maroon/20 bg-brand-true-maroon/10 text-brand-true-maroon",
  "maroon-solid": "border-transparent bg-brand-true-maroon text-white",
  success: "border-green-200 bg-green-50 text-green-700",
  danger: "border-red-200 bg-red-50 text-red-700",
  warning: "border-amber-200 bg-amber-50 text-amber-800",
} as const

/** Small rounded label: counts, statuses, tags. */
export function Badge({ tone = "neutral", caps = false, className, ...props }: {
  tone?: keyof typeof BADGE_TONES
  /** Uppercase with letter spacing, for statuses. */
  caps?: boolean
} & React.ComponentProps<"span">) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-bold whitespace-nowrap",
        caps && "uppercase tracking-wide",
        BADGE_TONES[tone],
        className
      )}
      {...props}
    />
  )
}

const STATUS: Record<string, { tone: keyof typeof BADGE_TONES; label: string; live?: boolean }> = {
  SCHEDULED: { tone: "success", label: "Scheduled" },
  CANCELLED: { tone: "danger", label: "Cancelled" },
  ARCHIVED: { tone: "brand", label: "Archived" },
  UNSCHEDULED: { tone: "neutral", label: "Not scheduled" },
  FINALIZED: { tone: "success", label: "Finalized", live: true },
  LOCKED: { tone: "neutral", label: "Locked" },
}

/** A meeting or roster status, with one colour per status everywhere. */
export function StatusPill({ status, className }: { status: string; className?: string }) {
  const s = STATUS[status] ?? { tone: "neutral" as const, label: status }
  return (
    <Badge tone={s.tone} caps className={className}>
      {s.live && <span className="size-1.5 rounded-full bg-green-500" aria-hidden />}
      {s.label}
    </Badge>
  )
}

const DISC_TONES = {
  brand: "bg-brand-loyal-blue/10 text-brand-loyal-blue",
  "brand-solid": "bg-brand-loyal-blue text-white",
  maroon: "bg-brand-true-maroon/10 text-brand-true-maroon",
  yellow: "bg-brand-happy-yellow text-brand-loyal-blue",
  danger: "bg-red-50 text-red-600",
  neutral: "bg-gray-100 text-gray-500",
  "on-brand": "bg-white/15 text-white",
} as const

const DISC_SIZES = { sm: "size-8", md: "size-12", lg: "size-16", xl: "size-24" } as const
const ICON_SIZES = { sm: 16, md: 22, lg: 30, xl: 44 } as const

/** An icon centred in a tinted circle. */
export function IconDisc({ icon: Icon, tone = "brand", size = "md", rounded = "full", className }: {
  icon: LucideIcon
  tone?: keyof typeof DISC_TONES
  size?: keyof typeof DISC_SIZES
  rounded?: "full" | "xl"
  className?: string
}) {
  return (
    <div className={cn("flex shrink-0 items-center justify-center", rounded === "full" ? "rounded-full" : "rounded-xl", DISC_TONES[tone], DISC_SIZES[size], className)}>
      <Icon size={ICON_SIZES[size]} />
    </div>
  )
}

/** "Nothing here yet" placeholder — the tutorial's dashed members-only card. */
export function EmptyState({ icon, title, children, action, className }: {
  icon: LucideIcon
  title: React.ReactNode
  children?: React.ReactNode
  action?: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn("flex flex-col items-center gap-3 rounded-2xl border-2 border-dashed border-brand-loyal-blue/20 bg-white px-6 py-12 text-center", className)}>
      <IconDisc icon={icon} size="lg" />
      <p className="text-lg font-black tracking-tight text-brand-loyal-blue">{title}</p>
      {children && <div className="max-w-sm text-sm leading-relaxed text-gray-500">{children}</div>}
      {action && <div className="pt-2">{action}</div>}
    </div>
  )
}

/** Loading indicator. */
export function Spinner({ size = 16, className }: { size?: number; className?: string }) {
  return <Loader2 size={size} className={cn("animate-spin", className)} aria-hidden />
}
