"use client"

import { isValidElement, cloneElement, useId, type ReactElement, type ReactNode } from "react"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"
import { FieldMessageContext } from "@/components/ui/field-message-context"

/** Related fields with a heading that moves beside the controls when the form is wide enough. */
export function FormSection({
  label,
  description,
  children,
  className,
}: {
  label?: string
  description?: string
  children: ReactNode
  className?: string
}) {
  return (
    <section className={cn("form-section flex min-w-0 flex-col gap-5", className)}>
      {(label || description) && (
        <div className="form-section-heading flex flex-col gap-1.5">
          {label && <h2 className="text-heading">{label}</h2>}
          {description && <p className="text-sm text-muted-foreground">{description}</p>}
        </div>
      )}
      <div className="form-section-fields flex min-w-0 flex-col gap-5">{children}</div>
    </section>
  )
}

/** Two-column field layout on larger widths, stacking to one column on narrow dialogs
 *  the reference pairs related fields (Project Name / Client) side by side rather than
 *  stacking every field full-width. */
export function FormGrid({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className="@container/fields min-w-0">
      <div className={cn("grid grid-cols-1 gap-5 @min-[30rem]/fields:grid-cols-2", className)}>
        {children}
      </div>
    </div>
  )
}

/** Label + control stack. The repeated shape every field in a form already had, pulled into
 *  one place so wizard steps read as a list of fields, not a list of label/input div pairs. */
export function FormField({
  label,
  htmlFor,
  hint,
  error,
  children,
  className,
}: {
  label: string
  htmlFor?: string
  /** Small muted helper line under the label, e.g. a format hint. Hidden while `error` is set,
   *  so the two don't stack and compete for attention. */
  hint?: string
  /** A zod/react-hook-form validation message. Rendered in place of `hint` when present. */
  error?: string
  children: ReactNode
  className?: string
}) {
  const generatedId = useId()
  const messageId = `${htmlFor ?? generatedId}-message`
  // Direct children receive ARIA props; context carries them through Controller wrappers.
  const content = isValidElement(children)
    ? cloneElement(
        children as ReactElement<{ "aria-invalid"?: boolean; "aria-describedby"?: string }>,
        {
          ...(error ? { "aria-invalid": true } : {}),
          ...(error || hint
            ? {
                "aria-describedby": [
                  (children.props as { "aria-describedby"?: string })["aria-describedby"],
                  messageId,
                ]
                  .filter(Boolean)
                  .join(" "),
              }
            : {}),
        },
      )
    : children

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <Label htmlFor={htmlFor}>{label}</Label>
      <FieldMessageContext.Provider
        value={{ messageId: error || hint ? messageId : undefined, invalid: !!error }}
      >
        {content}
      </FieldMessageContext.Provider>
      {error ? (
        <p id={messageId} className="text-xs text-destructive">
          {error}
        </p>
      ) : (
        hint && (
          <p id={messageId} className="text-xs text-muted-foreground">
            {hint}
          </p>
        )
      )}
    </div>
  )
}
