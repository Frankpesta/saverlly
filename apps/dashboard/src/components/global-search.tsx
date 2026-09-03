"use client"

import * as React from "react"
import { useRouter, usePathname } from "next/navigation"
import { CornerDownLeftIcon, SearchIcon } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import { useSearch } from "@/lib/api/hooks/use-search"
import type { SearchResult, SearchResultType } from "@/lib/api/types"

const DEBOUNCE_MS = 200
const MIN_QUERY_LENGTH = 2

const GROUP_ORDER: SearchResultType[] = [
  "location",
  "device",
  "announcement",
  "kiosk",
  "merchant",
  "coupon",
]

const GROUP_LABEL: Record<SearchResultType, string> = {
  location: "Locations",
  device: "Devices",
  announcement: "Announcements",
  kiosk: "Kiosks",
  merchant: "Merchants",
  coupon: "Coupons",
}

// Kiosk/Merchant results only ever come back for an ADMIN caller (the backend gates those
// branches to ADMIN), so they always live under /admin regardless of the caller's basePath.
// Device/Coupon have no [id] detail route today. Device kill-switch lives inline on the list
// row, coupons are edited via a row-level Dialog, not a route. So both link to their list page.
function hrefFor(result: SearchResult, basePath: string): string {
  switch (result.type) {
    case "kiosk":
      return `/admin/kiosks/${result.id}`
    case "merchant":
      return `/admin/merchants/${result.id}`
    case "coupon":
      return `/admin/coupons`
    case "location":
      return `${basePath}/locations/${result.id}`
    case "announcement":
      return `${basePath}/announcements/${result.id}`
    case "device":
      return `${basePath}/devices`
  }
}

export function GlobalSearch() {
  const router = useRouter()
  const pathname = usePathname()
  const basePath = pathname.startsWith("/admin") ? "/admin" : "/portal"

  const [open, setOpen] = React.useState(false)
  const [rawQuery, setRawQuery] = React.useState("")
  const [debouncedQuery, setDebouncedQuery] = React.useState("")
  const [activeType, setActiveType] = React.useState<SearchResultType | null>(null)

  React.useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(rawQuery), DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [rawQuery])

  const { data, isFetching } = useSearch(debouncedQuery)

  function handleOpenChange(next: boolean) {
    setOpen(next)
    if (!next) {
      setRawQuery("")
      setDebouncedQuery("")
      setActiveType(null)
    }
  }

  function handleSelect(result: SearchResult) {
    router.push(hrefFor(result, basePath))
    handleOpenChange(false)
  }

  const trimmed = rawQuery.trim()
  const hasQuery = trimmed.length >= MIN_QUERY_LENGTH
  const results = data ?? []
  // Ignore a stale filter chip left over from a previous query once its type no longer
  // has any matches, so a new search never renders as empty just because activeType wasn't reset.
  const effectiveActiveType =
    activeType && results.some((r) => r.type === activeType) ? activeType : null

  return (
    <>
      <Button
        type="button"
        variant="outline"
        onClick={() => setOpen(true)}
        aria-label="Search"
        className="size-9 justify-center gap-2 rounded-lg border-transparent p-0 text-muted-foreground hover:border-border hover:bg-background hover:text-foreground sm:w-56 sm:justify-start sm:p-2"
      >
        <span className="flex items-center gap-2">
          <SearchIcon className="size-4" />
          <span className="hidden sm:inline">Search...</span>
        </span>
      </Button>
      <CommandDialog
        open={open}
        onOpenChange={handleOpenChange}
        title="Search"
        description="Search kiosks, locations, devices, merchants, coupons, and announcements"
      >
        <CommandInput placeholder="Search..." value={rawQuery} onValueChange={setRawQuery} />
        {hasQuery && !isFetching && results.length > 0 && (
          <div className="flex flex-wrap gap-1.5 border-b border-border/70 px-3 py-2.5">
            {GROUP_ORDER.filter((type) => results.some((r) => r.type === type)).map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => setActiveType((prev) => (prev === type ? null : type))}
                className={cn(
                  "rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
                  effectiveActiveType === type
                    ? "border-transparent bg-[var(--brand-teal)] text-white"
                    : "border-border text-muted-foreground hover:border-[var(--brand-teal-soft)] hover:text-foreground",
                )}
              >
                {GROUP_LABEL[type]} · {results.filter((r) => r.type === type).length}
              </button>
            ))}
          </div>
        )}
        <CommandList>
          {!hasQuery && (
            <div className="py-6 text-center text-sm text-muted-foreground">
              Type at least 2 characters to search.
            </div>
          )}
          {hasQuery && isFetching && (
            <div className="py-6 text-center text-sm text-muted-foreground">Searching…</div>
          )}
          {hasQuery && !isFetching && results.length === 0 && (
            <CommandEmpty>No results for &ldquo;{trimmed}&rdquo;.</CommandEmpty>
          )}
          {hasQuery &&
            !isFetching &&
            GROUP_ORDER.filter((type) => !effectiveActiveType || type === effectiveActiveType).map((type) => {
              const group = results.filter((r) => r.type === type)
              if (group.length === 0) return null
              return (
                <CommandGroup
                  key={type}
                  heading={
                    <span className="flex items-center gap-1.5">
                      {GROUP_LABEL[type]}
                      <Badge variant="secondary" className="h-4 px-1.5 text-[0.65rem]">
                        {group.length}
                      </Badge>
                    </span>
                  }
                >
                  {group.map((result) => (
                    <CommandItem
                      key={`${result.type}-${result.id}`}
                      value={`${result.type}-${result.id}`}
                      onSelect={() => handleSelect(result)}
                    >
                      <div className="flex flex-1 flex-col overflow-hidden">
                        <span className="truncate">{result.title}</span>
                        {result.subtitle && (
                          <span className="truncate text-xs text-muted-foreground">
                            {result.subtitle}
                          </span>
                        )}
                      </div>
                      <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground opacity-0 transition-opacity group-data-[selected=true]:opacity-100">
                        Select <CornerDownLeftIcon className="size-3" />
                      </span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              )
            })}
        </CommandList>
      </CommandDialog>
    </>
  )
}
