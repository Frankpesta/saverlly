"use client"

import * as React from "react"
import { useRouter, usePathname } from "next/navigation"
import { SearchIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
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
// Device/Coupon have no [id] detail route today — device kill-switch lives inline on the list
// row, coupons are edited via a row-level Dialog, not a route — so both link to their list page.
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

  React.useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(rawQuery), DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [rawQuery])

  React.useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "k" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault()
        setOpen((prev) => !prev)
      }
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [])

  const { data, isFetching } = useSearch(debouncedQuery)

  function handleOpenChange(next: boolean) {
    setOpen(next)
    if (!next) {
      setRawQuery("")
      setDebouncedQuery("")
    }
  }

  function handleSelect(result: SearchResult) {
    router.push(hrefFor(result, basePath))
    handleOpenChange(false)
  }

  const trimmed = rawQuery.trim()
  const hasQuery = trimmed.length >= MIN_QUERY_LENGTH
  const results = data ?? []

  return (
    <>
      <Button
        type="button"
        variant="outline"
        onClick={() => setOpen(true)}
        className="w-56 justify-between gap-2 rounded-lg border-transparent text-muted-foreground hover:border-border hover:bg-background hover:text-foreground"
      >
        <span className="flex items-center gap-2">
          <SearchIcon className="size-4" />
          Search...
        </span>
        <kbd className="pointer-events-none hidden rounded-md border border-border bg-muted px-1.5 font-mono text-[0.7rem] text-muted-foreground sm:inline-block">
          ⌘K
        </kbd>
      </Button>
      <CommandDialog
        open={open}
        onOpenChange={handleOpenChange}
        title="Search"
        description="Search kiosks, locations, devices, merchants, coupons, and announcements"
      >
        <CommandInput placeholder="Search..." value={rawQuery} onValueChange={setRawQuery} />
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
            GROUP_ORDER.map((type) => {
              const group = results.filter((r) => r.type === type)
              if (group.length === 0) return null
              return (
                <CommandGroup key={type} heading={GROUP_LABEL[type]}>
                  {group.map((result) => (
                    <CommandItem
                      key={`${result.type}-${result.id}`}
                      value={`${result.type}-${result.id}`}
                      onSelect={() => handleSelect(result)}
                    >
                      <div className="flex flex-col overflow-hidden">
                        <span className="truncate">{result.title}</span>
                        {result.subtitle && (
                          <span className="truncate text-xs text-muted-foreground">
                            {result.subtitle}
                          </span>
                        )}
                      </div>
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
