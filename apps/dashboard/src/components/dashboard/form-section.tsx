import type { ReactNode } from "react"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"

/** A labeled group of fields within a wizard step or edit form — the small uppercase eyebrow
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

/** Two-column field layout on larger widths, stacking to one column on narrow dialogs —
 *  the reference pairs related fields (Project Name / Client) side by side rather than
 *  stacking every field full-width. */
export function FormGrid({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("grid grid-cols-1 gap-4 sm:grid-cols-2", className)}>{children}</div>
}

/** Label + control stack — the repeated shape every field in a form already had, pulled into
 *  one place so wizard steps read as a list of fields, not a list of label/input div pairs. */
export function FormField({
  label,
  htmlFor,
  hint,
  children,
  className,
}: {
  label: string
  htmlFor?: string
  /** Small muted helper line under the label, e.g. a format hint. */
  hint?: string
  children: ReactNode
  className?: string
}) {
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  )
}
