"use client"

import type { ReactNode } from "react"
import { XIcon } from "lucide-react"

/** Floating pill bar that appears once at least one table row is selected. Matches the
 *  bulk-action bar pattern from the tables reference. Renders nothing at `count === 0` so
 *  callers can mount it unconditionally right after their <Table>. */
export function TableSelectionToolbar({
  count,
  label = "selected on this page",
  onClear,
  children,
}: {
  count: number
  label?: string
  onClear: () => void
  children: ReactNode
}) {
  if (count === 0) return null

  return (
    <div role="region" aria-label="Selected rows" className="sticky bottom-0 z-10 py-2">
      <div className="pointer-events-auto flex flex-wrap items-center gap-3 rounded-lg bg-[var(--brand-black)] px-4 py-3 text-sm text-white shadow-sm">
        <span className="font-medium whitespace-nowrap">
          {count} {label}
        </span>
        <span className="h-4 w-px shrink-0 bg-white/20" />
        <div className="flex items-center gap-1">{children}</div>
        <button
          type="button"
          onClick={onClear}
          className="ml-1 shrink-0 rounded-full p-1 text-white/70 transition-colors hover:bg-white/10 hover:text-white"
          aria-label="Clear selection"
        >
          <XIcon className="size-3.5" />
        </button>
      </div>
    </div>
  )
}
