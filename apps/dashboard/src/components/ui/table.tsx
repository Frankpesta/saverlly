import * as React from "react"
import { motion } from "motion/react"

import { cn } from "@/lib/utils"

function Table({ className, ...props }: React.ComponentProps<"table">) {
  return (
    <div
      data-slot="table-container"
      className="relative w-full overflow-x-auto rounded-xl border border-black/[0.07] bg-card shadow-[0_8px_24px_rgba(17,27,24,0.035)] dark:border-white/10"
    >
      <table
        data-slot="table"
        className={cn("w-full caption-bottom text-sm", className)}
        {...props}
      />
    </div>
  )
}

function TableHeader({ className, ...props }: React.ComponentProps<"thead">) {
  return (
    <thead
      data-slot="table-header"
      className={cn("bg-[#f8faf9] [&_tr]:border-b [&_tr]:border-black/[0.06] dark:bg-white/[0.03] dark:[&_tr]:border-white/10", className)}
      {...props}
    />
  )
}

function TableBody({ className, ...props }: React.ComponentProps<"tbody">) {
  return (
    <tbody
      data-slot="table-body"
      className={cn("[&_tr:last-child]:border-0", className)}
      {...props}
    />
  )
}

function TableFooter({ className, ...props }: React.ComponentProps<"tfoot">) {
  return (
    <tfoot
      data-slot="table-footer"
      className={cn(
        "border-t bg-muted/50 font-medium [&>tr]:last:border-b-0",
        className
      )}
      {...props}
    />
  )
}

// motion.tr's own richer event types (drag/animation lifecycle) conflict with the plain DOM
// handler types of the same name on React.ComponentProps<"tr">. Omit them since no caller
// actually passes them (rows only ever get key/className/data-* + the standard cell children).
type TableRowProps = Omit<
  React.ComponentProps<"tr">,
  "onDrag" | "onDragStart" | "onDragEnd" | "onAnimationStart" | "onAnimationEnd" | "onAnimationIteration"
> & {
  /** Row position in a freshly-loaded list. When set, the row fades/slides in with a
   *  per-index stagger delay instead of rendering statically. Omit for tables that don't
   *  want entrance animation (e.g. rows added one at a time, not from a bulk fetch). */
  index?: number
}

function TableRow({ className, index, ...props }: TableRowProps) {
  const rowClassName = cn(
    "group border-b border-black/[0.055] dark:border-white/10 transition-colors hover:bg-[var(--brand-teal-tint)]/45 has-aria-expanded:bg-muted/50 data-[state=selected]:bg-[var(--brand-teal-tint)]",
    className
  )

  if (index === undefined) {
    return <tr data-slot="table-row" className={rowClassName} {...props} />
  }

  return (
    <motion.tr
      data-slot="table-row"
      className={rowClassName}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay: index * 0.03 }}
      {...props}
    />
  )
}

/** A trailing action cell's inner wrapper. Icon buttons (Edit, delete, etc), always visible
 *  rather than hover-revealed, so the actions are discoverable without a mouse. */
function TableRowActions({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="table-row-actions"
      className={cn("flex items-center justify-end gap-1", className)}
      {...props}
    />
  )
}

function TableHead({ className, ...props }: React.ComponentProps<"th">) {
  return (
    <th
      data-slot="table-head"
      className={cn(
        "h-11 px-5 text-left align-middle text-[11px] font-semibold tracking-[0.075em] text-muted-foreground uppercase whitespace-nowrap [&:has([role=checkbox])]:pr-0",
        className
      )}
      {...props}
    />
  )
}

function TableCell({ className, ...props }: React.ComponentProps<"td">) {
  return (
    <td
      data-slot="table-cell"
      className={cn("px-5 py-4 align-middle whitespace-nowrap [&:has([role=checkbox])]:pr-0", className)}
      {...props}
    />
  )
}

function TableCaption({
  className,
  ...props
}: React.ComponentProps<"caption">) {
  return (
    <caption
      data-slot="table-caption"
      className={cn("mt-4 text-sm text-muted-foreground", className)}
      {...props}
    />
  )
}

export {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableRowActions,
  TableCell,
  TableCaption,
}
