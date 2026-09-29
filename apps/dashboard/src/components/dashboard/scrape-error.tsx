"use client"
import { InfoIcon } from "lucide-react"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"

// Scrape errors can list every failed offer, so the table shows one line and the
// full message sits behind the info icon. Failures are joined with "; " by the scraper.
export function ScrapeError({ message }: { message: string }) {
  const parts = message.split("; ").filter(Boolean)
  return (
    <div className="flex max-w-xs items-center gap-1 text-xs text-destructive">
      <span className="min-w-0 truncate">Failed: {message}</span>
      <Popover>
        <PopoverTrigger
          aria-label="Show full error"
          className="shrink-0 rounded-sm p-0.5 text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          <InfoIcon className="size-3.5" />
        </PopoverTrigger>
        <PopoverContent align="start" className="w-96 max-w-[calc(100vw-2rem)]">
          <p className="font-medium">Last run failed</p>
          <ul className="flex max-h-72 flex-col gap-1 overflow-y-auto text-xs break-words text-muted-foreground">
            {parts.map((part, i) => (
              <li key={i}>{part}</li>
            ))}
          </ul>
        </PopoverContent>
      </Popover>
    </div>
  )
}
