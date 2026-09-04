import { isValidElement, cloneElement, type ReactElement, type ReactNode } from "react"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"

/** A labeled group of fields within a wizard step or edit form. The small uppercase eyebrow
 *  ("PROJECT DETAILS"-style) groups related fields visually, matching the forms reference. */
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
    <div className={cn("flex flex-col gap-4", className)}>
      {(label || description) && (
        <div className="flex flex-col gap-0.5">
          {label && (
            <span className="text-xs font-semibold tracking-[0.08em] text-muted-foreground uppercase">
              {label}
            </span>
          )}
          {description && <p className="text-sm text-muted-foreground">{description}</p>}
        </div>
      )}
      {children}
    </div>
  )
}

/** Two-column field layout on larger widths, stacking to one column on narrow dialogs
 *  the reference pairs related fields (Project Name / Client) side by side rather than
 *  stacking every field full-width. */
export function FormGrid({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("grid grid-cols-1 gap-5 sm:grid-cols-2", className)}>{children}</div>
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
  // Single-element children (the overwhelming common case. One Input/Combobox/etc. per field)
  // get `aria-invalid` injected automatically so the red-border styling built into those
  // components picks it up without every call site having to wire it by hand. Controller-wrapped
  // fields ignore the extra prop harmlessly and set it themselves via `fieldState.error` instead.
  const content =
    error && isValidElement(children)
      ? cloneElement(children as ReactElement<{ "aria-invalid"?: boolean }>, { "aria-invalid": true })
      : children

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <Label htmlFor={htmlFor}>{label}</Label>
      {content}
      {error ? (
        <p className="text-xs text-destructive">{error}</p>
      ) : (
        hint && <p className="text-xs text-muted-foreground">{hint}</p>
      )}
    </div>
  )
}
