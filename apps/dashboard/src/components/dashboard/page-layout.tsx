import * as React from "react"
import { cn } from "@/lib/utils"

/** Page header.
 *
 * `description` is optional and `eyebrow` is gone on purpose. When both were required props,
 * every list page rendered the same four-part stack: the top bar said "Kiosks", an eyebrow
 * said "PLATFORM NETWORK", the h1 said "Kiosks", and a subtitle said "Every kiosk business on
 * the platform, their status, and revenue share". Four renderings of one idea, two of them
 * explanatory sentences nobody reads. Only pass a description when it says something the
 * heading does not, for example a constraint or a scope the title cannot carry.
 */
export function WorkspaceHeader({
  title,
  description,
  actions,
  className,
}: {
  title: string
  description?: string
  actions?: React.ReactNode
  className?: string
}) {
  return (
    <header
      className={cn(
        "flex flex-col gap-4 border-b border-black/[0.09] pb-5 sm:flex-row sm:items-center sm:justify-between dark:border-white/10",
        className,
      )}
    >
      <div className="max-w-2xl">
        <h1 className="text-title text-foreground">{title}</h1>
        {description && <p className="mt-1.5 text-body text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </header>
  )
}

export function CollectionSummary({
  items,
  className,
  isLoading = false,
  isError = false,
}: {
  items: { label: string; value: React.ReactNode; detail?: string }[]
  className?: string
  isLoading?: boolean
  isError?: boolean
}) {
  return (
    <dl
      className={cn(
        "grid divide-y divide-border border-y border-border sm:divide-x sm:divide-y-0",
        items.length === 2 ? "sm:grid-cols-2" : items.length === 1 ? "sm:grid-cols-1" : "sm:grid-cols-3",
        className,
      )}
    >
      {items.map((item) => (
        <div key={item.label} className="min-w-0 py-4 sm:px-5 sm:first:pl-0 sm:last:pr-0">
          <dt className="text-eyebrow text-muted-foreground uppercase">{item.label}</dt>
          <dd className="mt-1.5 text-title tabular-nums text-foreground" aria-busy={isLoading}>{isLoading ? "…" : isError ? "Unavailable" : item.value}</dd>
          {!isLoading && !isError && item.detail && <p className="mt-0.5 text-meta text-muted-foreground">{item.detail}</p>}
        </div>
      ))}
    </dl>
  )
}

/** A titled region of a page, typically wrapping a table.
 *
 * `description` is optional for the same reason as on WorkspaceHeader: "Kiosk directory" did
 * not need "Manage status and revenue sharing for each kiosk business" underneath it, 250px
 * below a header that had already said the same thing twice.
 */
export function CollectionArea({
  title,
  description,
  titleHidden = false,
  children,
  className,
}: {
  title: string
  description?: string
  /** Kept for callers that still pass a count from a previous layout; no longer rendered here
   * (the card stat tiles above the table are the one source of truth for totals now). */
  count?: number
  /** Keep the heading for screen readers but drop it visually. Use this on a list page whose
   * WorkspaceHeader already names the same collection: rendering "Kiosks" in the top bar,
   * again as the h1, and a third time as "Kiosk directory" above the table is the clutter the
   * client called confusing. */
  titleHidden?: boolean
  children: React.ReactNode
  className?: string
}) {
  const headingId = `${title.toLowerCase().replace(/\s+/g, "-")}-heading`

  return (
    <section className={cn("flex flex-col gap-4", className)} aria-labelledby={headingId}>
      <div className={cn(titleHidden && "sr-only")}>
        <h2 id={headingId} className="text-heading">
          {title}
        </h2>
        {description && <p className="mt-1 text-body text-muted-foreground">{description}</p>}
      </div>
      {children}
    </section>
  )
}
