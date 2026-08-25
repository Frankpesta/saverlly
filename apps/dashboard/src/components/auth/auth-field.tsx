"use client"

import * as React from "react"
import { cn } from "@/lib/utils"

/** Purpose-built authentication field: the label moves into the input boundary only once the
 * field is active or has a value, so the form stays compact without losing context. */
export function AuthField({
  id,
  label,
  icon,
  className,
  inputClassName,
  ...props
}: React.ComponentProps<"input"> & { label: string; icon?: React.ReactNode; inputClassName?: string }) {
  const [focused, setFocused] = React.useState(false)
  const hasValue = String(props.value ?? props.defaultValue ?? "").length > 0
  const active = focused || hasValue

  return (
    <div className={cn("auth-field", active && "auth-field-active", className)}>
      {icon && <span className="auth-field-icon" aria-hidden>{icon}</span>}
      <input
        id={id}
        placeholder=" "
        {...props}
        className={cn("auth-field-input", icon && "auth-field-input-icon", inputClassName)}
        onFocus={(event) => {
          setFocused(true)
          props.onFocus?.(event)
        }}
        onBlur={(event) => {
          setFocused(false)
          props.onBlur?.(event)
        }}
      />
      <label htmlFor={id} className={cn("auth-field-label", icon && "auth-field-label-icon")}>
        {label}
      </label>
      <span className="auth-field-focus-line" aria-hidden />
    </div>
  )
}
