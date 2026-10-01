/**
 * Page Layout Pieces
 *
 * The shell, header and section labels every signed-in page uses, so page
 * width, padding, title size and label style are decided once.
 */
import { cn } from "@/lib/utils"

// Literal class strings, so Tailwind can see them.
const WIDTHS = {
  "3xl": "max-w-3xl",
  "4xl": "max-w-4xl",
  "5xl": "max-w-5xl",
  "6xl": "max-w-6xl",
  "7xl": "max-w-7xl",
} as const

/**
 * Grey page background plus a centred content column. Deliberately no
 * min-height: <main> already fills the viewport, which keeps the footer at
 * the bottom of short pages instead of pushing it below the fold.
 */
export function PageShell({ width = "6xl", className, children, ...props }: {
  width?: keyof typeof WIDTHS
} & React.ComponentProps<"div">) {
  return (
    <div className="flex-1 bg-brand-cool-grey/10 px-4 py-8 sm:px-6 md:py-10">
      <div className={cn("mx-auto w-full", WIDTHS[width], className)} {...props}>
        {children}
      </div>
    </div>
  )
}

/** Page title block: title, one-line description, optional pills and actions. */
export function PageHeader({ title, description, children, actions, className }: {
  title: React.ReactNode
  description?: React.ReactNode
  /** Pills/badges shown under the title. */
  children?: React.ReactNode
  /** Buttons or counters on the right. */
  actions?: React.ReactNode
  className?: string
}) {
  return (
    <header className={cn("mb-8 flex flex-col gap-4 border-b border-gray-200 pb-6 md:flex-row md:items-end md:justify-between", className)}>
      <div className="min-w-0">
        <h1 className="text-3xl font-black tracking-tight text-brand-loyal-blue md:text-4xl">{title}</h1>
        {description && <p className="mt-2 text-gray-600 leading-relaxed">{description}</p>}
        {children && <div className="mt-3 flex flex-wrap items-center gap-2">{children}</div>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </header>
  )
}

/** Small uppercase heading above a group of content ("PENDING APPROVALS"). */
export function SectionLabel({ as: Tag = "h2", className, ...props }: {
  as?: "h2" | "h3" | "p" | "dt" | "span"
} & React.HTMLAttributes<HTMLElement>) {
  return <Tag className={cn("text-xs font-bold uppercase tracking-widest text-gray-500", className)} {...props} />
}
