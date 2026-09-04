"use client"

import * as React from "react"
import Link from "next/link"
import { ArrowLeftIcon } from "lucide-react"
import { Button, buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { cn } from "@/lib/utils"

/** The title row every page-based create/edit form uses: a back link to the list page, the
 * entity's name/heading, an optional one-line description, and room for page-level actions
 * (a status badge, a delete button) that belong beside the title rather than the form itself.
 * Title-only, no Cancel/Submit: those live in `EntityFormCard`'s footer, at the bottom of the
 * form next to the fields they act on, not stranded above content that hasn't been seen yet.
 * Matches the header row every existing detail page (kiosks/[id], for one) already uses above
 * its own Card. */
export function EntityFormHeader({
  backHref,
  backLabel,
  heading,
  description,
  headerActions,
}: {
  backHref: string
  backLabel: string
  heading: string
  description?: string
  headerActions?: React.ReactNode
}) {
  return (
    <div className="flex w-full flex-wrap items-start justify-between gap-4 border-b border-black/[0.09] pb-6 dark:border-white/10">
      <div className="flex flex-col gap-3">
        <Link
          href={backHref}
          className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeftIcon className="size-4" />
          {backLabel}
        </Link>
        <div>
          <h2 className="text-title">{heading}</h2>
          {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
        </div>
      </div>
      {headerActions && <div className="flex items-center gap-3">{headerActions}</div>}
    </div>
  )
}

/** The bordered card every page-based form's fields live inside, with Cancel/Submit in its
 * footer at the bottom, matching the existing Card + CardContent + CardFooter shape
 * kiosks/[id]/page.tsx's edit form already established. Fields floating loose on the page
 * plane with nothing to bound them, and Cancel/Submit stranded at the top of the page before
 * any field has been seen, were both flagged directly and are what this replaces. */
export function EntityFormCard({
  title,
  headerExtra,
  children,
  cancelHref,
  submitLabel,
  pendingLabel,
  isPending,
  submitDisabled,
  className,
}: {
  /** Optional CardHeader title, e.g. "Business details". Omit for a single-purpose form (a
   * create page usually doesn't need one, since EntityFormHeader already named the page). */
  title?: string
  /** Rendered on the right of the CardHeader, e.g. an active/inactive toggle. Only shown when
   * `title` is also set, since a header with only this and no title would look unbalanced. */
  headerExtra?: React.ReactNode
  children: React.ReactNode
  cancelHref: string
  submitLabel: string
  pendingLabel: string
  isPending: boolean
  submitDisabled?: boolean
  className?: string
}) {
  return (
    <Card className={cn("w-full [--card-spacing:--spacing(8)]", className)}>
      {title && (
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>{title}</CardTitle>
          {headerExtra}
        </CardHeader>
      )}
      <CardContent className="flex flex-col gap-8">{children}</CardContent>
      <CardFooter className="justify-end gap-2">
        <Link href={cancelHref} className={cn(buttonVariants({ variant: "outline" }))}>
          Cancel
        </Link>
        <Button type="submit" disabled={isPending || submitDisabled}>
          {isPending ? pendingLabel : submitLabel}
        </Button>
      </CardFooter>
    </Card>
  )
}

/** A result panel that replaces the form after a create flow that ends in a one-time credential
 * reveal (a generated owner/team-member password). Previously this was a step in a wizard;
 * flattening every wizard into a single page per the client's request means it becomes a
 * post-submit state on the same page instead of a fifth step. */
export function EntityCreatedPanel({
  icon,
  title,
  description,
  children,
  doneHref,
  doneLabel,
}: {
  icon?: React.ReactNode
  title: string
  description: string
  children: React.ReactNode
  doneHref: string
  doneLabel: string
}) {
  return (
    <div className="flex flex-col items-center gap-6 rounded-2xl border border-black/8 bg-card p-10 text-center shadow-xs dark:border-white/10">
      {icon && (
        <span className="flex size-12 items-center justify-center rounded-full bg-[var(--brand-teal-tint)] text-[var(--brand-teal)]">
          {icon}
        </span>
      )}
      <div className="flex flex-col gap-1.5">
        <h2 className="text-title">{title}</h2>
        <p className="max-w-md text-sm text-muted-foreground">{description}</p>
      </div>
      <div className="w-full max-w-sm">{children}</div>
      <Link href={doneHref} className={cn(buttonVariants({ variant: "default" }), "mt-2")}>
        {doneLabel}
      </Link>
    </div>
  )
}
