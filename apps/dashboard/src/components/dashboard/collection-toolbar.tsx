"use client"

import { SearchIcon, XIcon } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Combobox } from "@/components/ui/combobox"

export function CollectionToolbar({
  view,
  label,
}: {
  label: string
  view: {
    query: string
    setQuery: (value: string) => void
    filter: string
    setFilter: (value: string) => void
    sort: string
    setSort: (value: string) => void
    hasFilters: boolean
    clear: () => void
    items: unknown[]
    sortOptions: { label: string; value: string }[]
    filterOptions: { label: string; value: string }[]
  }
}) {
  return (
    <div
      role="search"
      aria-label={`${label} controls`}
      className="flex flex-wrap items-center gap-3"
    >
      <div className="relative min-w-48 flex-1">
        <SearchIcon
          aria-hidden
          className="pointer-events-none absolute top-3 left-3 size-4 text-muted-foreground"
        />
        <Input
          type="search"
          aria-label={`Search ${label}`}
          placeholder={`Search ${label.toLowerCase()}…`}
          value={view.query}
          onChange={(event) => view.setQuery(event.target.value)}
          className="pl-9"
        />
      </div>
      {view.filterOptions.length > 0 && (
        <Combobox
          aria-label={`Filter ${label}`}
          className="w-full sm:w-44"
          value={view.filter}
          onValueChange={view.setFilter}
          options={[{ label: "All statuses", value: "all" }, ...view.filterOptions]}
        />
      )}
      {view.sortOptions.length > 0 && (
        <Combobox
          aria-label={`Sort ${label}`}
          className="w-full sm:w-48"
          value={view.sort}
          onValueChange={view.setSort}
          options={view.sortOptions}
        />
      )}
      {view.hasFilters && (
        <Button variant="ghost" type="button" onClick={view.clear}>
          <XIcon />
          Clear
        </Button>
      )}
    </div>
  )
}
