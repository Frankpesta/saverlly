"use client"

import type { ReactNode } from "react"
import { XIcon } from "lucide-react"

/** Floating pill bar that appears once at least one table row is selected — matches the
 *  bulk-action bar pattern from the tables reference. Renders nothing at `count === 0` so
 *  callers can mount it unconditionally right after their <Table>. */
export function TableSelectionToolbar({
  count,
  label = "selected",
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
    <div className="sticky bottom-4 z-10 flex justify-center py-2">
      <div className="pointer-events-auto flex items-center gap-3 rounded-full bg-[var(--brand-black)] px-4 py-2 text-sm text-white shadow-[0_12px_32px_rgba(0,0,0,0.28)]">
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
