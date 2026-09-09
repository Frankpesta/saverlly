"use client"

import { InlineQueryError } from "@/components/dashboard/query-state"

import * as React from "react"
import Link from "next/link"
import { toast } from "sonner"
import { PencilIcon, PlayIcon, PlusIcon } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button, buttonVariants } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableRowActions,
} from "@/components/ui/table"
import { CollectionSummary } from "@/components/dashboard/page-layout"
import { DeleteRowButton } from "@/components/dashboard/delete-row-button"
import { TablePagination } from "@/components/dashboard/table-pagination"
import {
  useDeleteScrapeSource,
  useRunScrapeSourceNow,
  useScrapeSources,
  useUpdateScrapeSource,
} from "@/lib/api/hooks/use-scrape-sources"
import { useMerchants } from "@/lib/api/hooks/use-merchants"
import { ApiError } from "@/lib/api/client"
import { relativeTime } from "@/lib/relative-time"
import { useCollectionView } from "@/hooks/use-collection-view"
import { CollectionToolbar } from "@/components/dashboard/collection-toolbar"
import { usePagination } from "@/hooks/use-pagination"
import type { ScrapeSource } from "@/lib/api/types"
import { cn } from "@/lib/utils"

export default function ScrapeSourcesPage() {
  const { data: sources, isLoading, isError, refetch } = useScrapeSources()
  const { data: merchants } = useMerchants()
  const view = useCollectionView(sources, {
    searchText: (item) => item.url,
    sorts: [{ label: "Name: A to Z", value: "name", compare: (a, b) => a.url.localeCompare(b.url, undefined, { numeric: true }) }],
    filters: [{ label: "Active", value: "active", matches: (item) => item.active }, { label: "Inactive", value: "inactive", matches: (item) => !(item.active) }],
  })
  const { page, setPage, pageCount, pageItems, totalItems, pageSize } = usePagination(view.items, undefined, view.resetKey)

  const merchantNameById = React.useMemo(() => {
    const map = new Map<string, string>()
    for (const merchant of merchants ?? []) map.set(merchant.id, merchant.name)
    return map
  }, [merchants])

  const stats = React.useMemo(() => {
    const list = sources ?? []
    return { total: list.length, active: list.filter((s) => s.active).length }
  }, [sources])

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-border pb-5">
        <div>
          <h1 className="text-title">Scrape Sources</h1>
          <p className="text-sm text-muted-foreground">
            Pages the scraper checks on a schedule for new coupon codes.
          </p>
        </div>
        <Link href="/admin/scrape-sources/new" className={cn(buttonVariants(), "gap-1.5")}>
          <PlusIcon className="size-4" />
          New Scrape Source
        </Link>
      </div>

      <CollectionSummary isLoading={isLoading} isError={isError} items={[{ label: "Sources", value: stats.total }, { label: "Active", value: stats.active }]} />

      <CollectionToolbar view={view} label="Scrape sources" />

      {isError && <InlineQueryError message="Could not load scrape sources." onRetry={refetch} />}

      <div className="flex flex-col gap-2">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>URL</TableHead>
              <TableHead>Merchant</TableHead>
              <TableHead>Run interval</TableHead>
              <TableHead>Last run</TableHead>
              <TableHead>Active</TableHead>
              <TableHead className="w-32" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading &&
              Array.from({ length: 4 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell colSpan={6}>
                    <Skeleton className="h-6 w-full" />
                  </TableCell>
                </TableRow>
              ))}

            {!isLoading && !isError && view.items.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground">
                  {view.hasFilters ? "No records match your search or filters." : "No scrape sources yet."}
                </TableCell>
              </TableRow>
            )}

            {pageItems.map((source, index) => (
              <ScrapeSourceRow
                key={source.id}
                source={source}
                index={index}
                merchantName={source.merchantId ? merchantNameById.get(source.merchantId) : undefined}
              />
            ))}
          </TableBody>
        </Table>
        <TablePagination
          page={page}
          pageCount={pageCount}
          totalItems={totalItems}
          pageSize={pageSize}
          onPageChange={setPage}
        />
      </div>
    </div>
  )
}

function ScrapeSourceRow({
  source,
  index,
  merchantName,
}: {
  source: ScrapeSource
  index: number
  merchantName?: string
}) {
  const updateSource = useUpdateScrapeSource(source.id)
  const runNow = useRunScrapeSourceNow()
  const deleteSource = useDeleteScrapeSource()

  function handleDelete() {
    deleteSource.mutate(source.id, {
      onSuccess: () => toast.success("Scrape source deleted."),
      onError: (error) =>
        toast.error(error instanceof ApiError ? error.message : "Could not delete scrape source."),
    })
  }

  function toggleActive() {
    updateSource.mutate(
      { active: !source.active },
      {
        onError: (error) =>
          toast.error(error instanceof ApiError ? error.message : "Could not update scrape source."),
      },
    )
  }

  function handleRunNow() {
    runNow.mutate(source.id, {
      onSuccess: () => toast.success("Scrape queued."),
      onError: (error) =>
        toast.error(error instanceof ApiError ? error.message : "Could not queue scrape."),
    })
  }

  return (
    <TableRow index={index}>
      <TableCell className="max-w-64 truncate font-medium" title={source.url}>
        {source.url}
      </TableCell>
      <TableCell>
        {merchantName ?? <Badge variant="secondary">Unassigned</Badge>}
      </TableCell>
      <TableCell>{source.intervalMinutes} min</TableCell>
      <TableCell>{source.lastRunAt ? relativeTime(source.lastRunAt) : "Never"}</TableCell>
      <TableCell>
        <Switch
          checked={source.active}
          onCheckedChange={toggleActive}
          disabled={updateSource.isPending}
          aria-label="Toggle scrape source active"
        />
      </TableCell>
      <TableCell>
        <TableRowActions>
          <Link
            href={`/admin/scrape-sources/${source.id}`}
            className={cn(buttonVariants({ variant: "ghost", size: "icon-sm" }), "text-muted-foreground hover:text-foreground")}
            aria-label={`Edit ${source.url}`}
          >
            <PencilIcon className="size-3.5" />
          </Link>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="text-primary"
            onClick={handleRunNow}
            disabled={runNow.isPending}
            aria-label="Run now"
          >
            <PlayIcon className="size-3.5" />
          </Button>
          <DeleteRowButton
            itemLabel={merchantName ? `the scrape source for ${merchantName}` : "this scrape source"}
            onConfirm={handleDelete}
            isPending={deleteSource.isPending}
          />
        </TableRowActions>
      </TableCell>
    </TableRow>
  )
}
