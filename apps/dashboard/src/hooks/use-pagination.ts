"use client"

import * as React from "react"

export const DEFAULT_PAGE_SIZE = 25

/** Client-side pagination over an already-fetched array. Resets to page 1 whenever the
 * item count changes (e.g. a filter narrows the result set) so the caller never lands on
 * an out-of-range page silently showing stale rows. Resets during render (React's documented
 * "adjusting state when a prop changes" pattern) rather than in an effect, since setting
 * state synchronously inside an effect just to re-render immediately is redundant work. */
export function usePagination<T>(items: T[] | undefined, pageSize: number = DEFAULT_PAGE_SIZE) {
  const totalItems = items?.length ?? 0
  const pageCount = Math.max(1, Math.ceil(totalItems / pageSize))

  const [page, setPage] = React.useState(1)
  const [prevTotalItems, setPrevTotalItems] = React.useState(totalItems)

  if (totalItems !== prevTotalItems) {
    setPrevTotalItems(totalItems)
    setPage(1)
  }

  const currentPage = Math.min(page, pageCount)
  const start = (currentPage - 1) * pageSize
  const pageItems = React.useMemo(
    () => items?.slice(start, start + pageSize) ?? [],
    [items, start, pageSize],
  )

  return { page: currentPage, setPage, pageCount, pageItems, totalItems, pageSize }
}
