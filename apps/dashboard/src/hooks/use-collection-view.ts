"use client"

import { useEffect, useMemo, useState } from "react"

export type CollectionSort<T> = { label: string; value: string; compare: (a: T, b: T) => number }
export type CollectionFilterOption<T> = { label: string; value: string; matches: (item: T) => boolean }
/** One dropdown's worth of mutually-exclusive options (e.g. "Status": Active/Inactive). Pass
 * more than one group to let filters combine — an item must match every group's current
 * selection, not just one. */
export type CollectionFilterGroup<T> = { key: string; label: string; options: CollectionFilterOption<T>[] }

const SEARCH_DEBOUNCE_MS = 250

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
    filters?: CollectionFilterGroup<T>[]
  },
) {
  const [query, setQuery] = useState("")
  const [debouncedQuery, setDebouncedQuery] = useState("")
  const [filterValues, setFilterValues] = useState<Record<string, string>>({})
  const [sort, setSort] = useState(sorts[0]?.value ?? "")

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [query])

  function setFilterValue(key: string, value: string) {
    setFilterValues((previous) => ({ ...previous, [key]: value }))
  }

  const filtered = useMemo(() => {
    const needle = debouncedQuery.trim().toLocaleLowerCase()
    const activePredicates = filters
      .map((group) => {
        const selected = filterValues[group.key] ?? "all"
        return selected === "all" ? null : group.options.find((option) => option.value === selected)?.matches
      })
      .filter((predicate): predicate is (item: T) => boolean => !!predicate)
    const compare = sorts.find((entry) => entry.value === sort)?.compare
    const result = (items ?? []).filter(
      (item) =>
        (!needle || searchText(item).toLocaleLowerCase().includes(needle)) &&
        activePredicates.every((matches) => matches(item)),
    )
    return compare ? result.sort(compare) : result
  }, [items, debouncedQuery, filterValues, sort, searchText, sorts, filters])

  const hasFilters = !!query || Object.values(filterValues).some((value) => value && value !== "all")

  return {
    items: filtered,
    query,
    setQuery,
    filterValues,
    setFilterValue,
    sort,
    setSort,
    resetKey: JSON.stringify([debouncedQuery, filterValues, sort]),
    sortOptions: sorts.map(({ label, value }) => ({ label, value })),
    filterGroups: filters.map(({ key, label, options }) => ({
      key,
      label,
      options: options.map(({ label, value }) => ({ label, value })),
    })),
    hasFilters,
    clear: () => {
      setQuery("")
      setFilterValues({})
    },
  }
}
