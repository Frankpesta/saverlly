"use client"

import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react"
import { Button } from "@/components/ui/button"

/** A footer bar for a table wrapper (`overflow-hidden rounded-2xl border ...`) — render it as
 * the sibling right after `<Table>`, not inside it, so it shares the wrapper's rounded corners.
 * Renders nothing once everything fits on one page. */
export function TablePagination({
  page,
  pageCount,
  totalItems,
  pageSize,
  onPageChange,
}: {
  page: number
  pageCount: number
  totalItems: number
  pageSize: number
  onPageChange: (page: number) => void
}) {
  if (totalItems <= pageSize) return null

  const start = totalItems === 0 ? 0 : (page - 1) * pageSize + 1
  const end = Math.min(page * pageSize, totalItems)

  return (
    <div className="flex items-center justify-between border-t border-black/8 px-4 py-3">
      <p className="text-sm text-muted-foreground">
        Showing {start}–{end} of {totalItems}
      </p>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
          className="gap-1"
        >
          <ChevronLeftIcon className="size-3.5" />
          Previous
        </Button>
        <span className="text-sm text-muted-foreground">
          Page {page} of {pageCount}
        </span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={page >= pageCount}
          onClick={() => onPageChange(page + 1)}
          className="gap-1"
        >
          Next
          <ChevronRightIcon className="size-3.5" />
        </Button>
      </div>
    </div>
  )
}
