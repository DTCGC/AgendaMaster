import * as React from "react"
import { Input as InputPrimitive } from "@base-ui/react/input"

import { cn } from "@/lib/utils"

/** Shared by <Input>, <NativeSelect> and the email editor frame, so every field matches. */
export const fieldClass =
  "w-full min-w-0 rounded-xl border border-gray-200 bg-white text-sm text-gray-800 transition-colors outline-none placeholder:text-gray-400 hover:border-gray-300 focus-visible:border-brand-loyal-blue focus-visible:ring-3 focus-visible:ring-brand-loyal-blue/15 disabled:cursor-not-allowed disabled:bg-gray-50 disabled:opacity-60 aria-invalid:border-red-400 aria-invalid:ring-red-100"

const fieldSizes = {
  sm: "h-8 rounded-lg px-2.5 text-xs",
  default: "h-11 px-4",
}

function Input({
  className,
  type,
  size = "default",
  ...props
}: Omit<React.ComponentProps<"input">, "size"> & { size?: keyof typeof fieldSizes }) {
  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      className={cn(fieldClass, fieldSizes[size], className)}
      {...props}
    />
  )
}

/** A native <select> styled like <Input> (native menus suit long member lists). */
function NativeSelect({
  className,
  size = "default",
  ...props
}: Omit<React.ComponentProps<"select">, "size"> & { size?: keyof typeof fieldSizes }) {
  return (
    <select
      data-slot="native-select"
      className={cn(fieldClass, fieldSizes[size], "cursor-pointer pr-2", className)}
      {...props}
    />
  )
}

export { Input, NativeSelect }
