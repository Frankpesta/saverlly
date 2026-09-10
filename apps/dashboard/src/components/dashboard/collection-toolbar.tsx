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
    filterValues: Record<string, string>
    setFilterValue: (key: string, value: string) => void
    sort: string
    setSort: (value: string) => void
    hasFilters: boolean
    clear: () => void
    items: unknown[]
    sortOptions: { label: string; value: string }[]
    filterGroups: { key: string; label: string; options: { label: string; value: string }[] }[]
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
      {view.filterGroups.map((group) => (
        <Combobox
          key={group.key}
          aria-label={`Filter ${label} by ${group.label}`}
          className="w-full sm:w-44"
          value={view.filterValues[group.key] ?? "all"}
          onValueChange={(value) => view.setFilterValue(group.key, value)}
          options={[{ label: `All ${group.label.toLowerCase()}`, value: "all" }, ...group.options]}
        />
      ))}
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
