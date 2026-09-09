"use client"

import { useMemo, useState } from "react"

export type CollectionSort<T> = { label: string; value: string; compare: (a: T, b: T) => number }
export type CollectionFilter<T> = { label: string; value: string; matches: (item: T) => boolean }

/** Search/filter/sort the complete fetched collection before paginating. */
export function useCollectionView<T>(
  items: T[] | undefined,
  {
    searchText,
    sorts,
    filters = [],
  }: {
    searchText: (item: T) => string
    sorts: CollectionSort<T>[]
    filters?: CollectionFilter<T>[]
  },
) {
  const [query, setQuery] = useState("")
  const [filter, setFilter] = useState("all")
  const [sort, setSort] = useState(sorts[0]?.value ?? "")
  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase()
    const predicate = filters.find((entry) => entry.value === filter)?.matches
    const compare = sorts.find((entry) => entry.value === sort)?.compare
    const result = (items ?? []).filter(
      (item) =>
        (!needle || searchText(item).toLocaleLowerCase().includes(needle)) &&
        (!predicate || predicate(item)),
    )
    return compare ? result.sort(compare) : result
  }, [items, query, filter, sort, searchText, sorts, filters])
  return {
    items: filtered,
    query,
    setQuery,
    filter,
    setFilter,
    sort,
    setSort,
    resetKey: JSON.stringify([query, filter, sort]),
    sortOptions: sorts.map(({ label, value }) => ({ label, value })),
    filterOptions: filters.map(({ label, value }) => ({ label, value })),
    hasFilters: !!query || filter !== "all",
    clear: () => {
      setQuery("")
      setFilter("all")
    },
  }
}
