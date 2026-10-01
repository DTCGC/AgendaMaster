/**
 * Button class recipe. Kept out of button.tsx (a client module) so server
 * components can style a <Link> as a button: className={buttonVariants(...)}.
 */
import { cva } from "class-variance-authority"

/**
 * The app's one button style. For a link that looks like a button, put
 * `buttonVariants({ variant, size })` on the <Link> instead of nesting.
 */
export const buttonVariants = cva(
  "group/button inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 rounded-xl border border-transparent font-bold whitespace-nowrap transition-colors outline-none select-none focus-visible:ring-3 focus-visible:ring-brand-loyal-blue/30 focus-visible:ring-offset-1 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        /** Primary action: loyal blue. */
        default: "bg-brand-loyal-blue text-white shadow-sm hover:bg-brand-loyal-blue/90",
        /** Primary action in admin context. */
        maroon: "bg-brand-true-maroon text-white shadow-sm hover:bg-brand-true-maroon/90",
        /** Secondary action on a light background. */
        outline:
          "border-brand-loyal-blue/20 bg-white text-brand-loyal-blue hover:border-brand-loyal-blue/40 hover:bg-brand-loyal-blue/5",
        /** Low-emphasis action (Back, Cancel). */
        secondary: "border-gray-200 bg-gray-100 text-gray-700 hover:bg-gray-200",
        ghost: "text-gray-600 hover:bg-gray-100 hover:text-gray-800",
        /** Irreversible action. */
        destructive: "bg-red-600 text-white shadow-sm hover:bg-red-700",
        /** Destructive action that should not dominate (Deny, Disable). */
        "destructive-outline": "border-red-200 bg-white text-red-600 hover:bg-red-50",
        success: "bg-green-600 text-white shadow-sm hover:bg-green-700",
        /** On a blue/maroon bar (top navigation). */
        "on-brand": "border-white/30 bg-white/10 text-white hover:bg-white/20",
        link: "rounded-none p-0 text-brand-loyal-blue underline-offset-4 hover:underline",
      },
      size: {
        sm: "h-8 px-3 text-xs [&_svg:not([class*='size-'])]:size-3.5",
        default: "h-10 px-5 text-sm [&_svg:not([class*='size-'])]:size-4",
        lg: "h-12 px-8 text-base [&_svg:not([class*='size-'])]:size-5",
        icon: "size-9 [&_svg:not([class*='size-'])]:size-4",
        "icon-sm": "size-8 rounded-lg [&_svg:not([class*='size-'])]:size-4",
      },
    },
    compoundVariants: [{ variant: "link", className: "h-auto px-0" }],
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

