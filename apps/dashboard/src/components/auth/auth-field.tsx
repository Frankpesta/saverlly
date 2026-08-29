"use client"

import * as React from "react"
import { EyeIcon, EyeOffIcon } from "lucide-react"
import { cn } from "@/lib/utils"

/** Purpose-built authentication field: the label moves into the input boundary only once the
 * field is active or has a value, so the form stays compact without losing context. A
 * `type="password"` field automatically gets a show/hide toggle — hidden by default. Spreads
 * `{...props}` (including `ref`) straight onto the native `<input>`, so it drops into a
 * react-hook-form `register()` call with no wrapper needed. */
export function AuthField({
  id,
  label,
  icon,
  error,
  className,
  inputClassName,
  ...props
}: React.ComponentProps<"input"> & {
  label: string
  icon?: React.ReactNode
  /** A zod/react-hook-form validation message, shown below the field in place of silence. */
  error?: string
  inputClassName?: string
}) {
  const [focused, setFocused] = React.useState(false)
  const [revealed, setRevealed] = React.useState(false)
  const hasValue = String(props.value ?? props.defaultValue ?? "").length > 0
  const active = focused || hasValue
  const isPassword = props.type === "password"

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <div className={cn("auth-field", active && "auth-field-active", !!error && "auth-field-invalid")}>
        {icon && <span className="auth-field-icon" aria-hidden>{icon}</span>}
        <input
          id={id}
          placeholder=" "
          aria-invalid={!!error}
          {...props}
          type={isPassword && revealed ? "text" : props.type}
          className={cn(
            "auth-field-input",
            icon && "auth-field-input-icon",
            isPassword && "pr-10",
            inputClassName,
          )}
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
        {isPassword && (
          <button
            type="button"
            onClick={() => setRevealed((prev) => !prev)}
            aria-label={revealed ? "Hide password" : "Show password"}
            tabIndex={-1}
            className="absolute top-1/2 right-3 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            {revealed ? <EyeOffIcon className="size-4" /> : <EyeIcon className="size-4" />}
          </button>
        )}
      </div>
      {error && <p className="px-1 text-xs text-destructive">{error}</p>}
    </div>
  )
}
