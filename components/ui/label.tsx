import * as React from "react"

import { cn } from "@/lib/utils"

/** Form field label. Always pair with the field's id via htmlFor. */
function Label({ className, ...props }: React.ComponentProps<"label">) {
  return (
    <label
      data-slot="label"
      className={cn("mb-1.5 block text-sm font-semibold text-gray-700", className)}
      {...props}
    />
  )
}

/** Help text under a field. */
function FieldHint({ className, ...props }: React.ComponentProps<"p">) {
  return <p className={cn("mt-1.5 text-xs leading-relaxed text-gray-500", className)} {...props} />
}

export { Label, FieldHint }
