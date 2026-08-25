"use client"

import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react"
import { Button } from "@/components/ui/button"

/** A compact table footer that stays visually independent from the rows above. Render it as
 * the sibling right after `<Table>`; the table's separated rows should never be forced into a
 * single heavyweight container just to accommodate pagination. */
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
    <div className="mt-3 flex items-center justify-between rounded-xl border border-black/[0.06] bg-card px-5 py-3 shadow-[0_8px_24px_rgba(17,27,24,0.035)]">
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
