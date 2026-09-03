"use client"

import { useParams } from "next/navigation"
import { Skeleton } from "@/components/ui/skeleton"
import { useMerchants } from "@/lib/api/hooks/use-merchants"
import { useScrapeSources } from "@/lib/api/hooks/use-scrape-sources"
import { ScrapeSourceForm } from "../scrape-source-form"

export default function EditScrapeSourcePage() {
  const { id } = useParams<{ id: string }>()
  const { data: sources, isLoading, isError } = useScrapeSources()
  const { data: merchants } = useMerchants()

  // There is no single-source endpoint, so the row comes out of the list the page already
  // needs for the merchant picker anyway.
  const source = sources?.find((s) => s.id === id)

  if (isError) {
    return <p className="text-sm text-destructive">Could not load this scrape source.</p>
  }

  if (isLoading || !source) {
    return (
      <div className="flex flex-col gap-6">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-96 w-full max-w-2xl" />
      </div>
    )
  }

  return (
    <ScrapeSourceForm
      // react-hook-form only reads defaultValues on mount, so a different source loading into
      // the same route needs a remount to actually show its own values.
      key={source.id}
      source={source}
      merchants={merchants}
      backHref="/admin/scrape-sources"
      backLabel="Scrape sources"
    />
  )
}
