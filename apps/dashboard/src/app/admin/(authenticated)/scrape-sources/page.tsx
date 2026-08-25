"use client"

import * as React from "react"
import { toast } from "sonner"
import { DatabaseIcon, CircleCheckIcon, PlayIcon } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
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
import { BentoGrid } from "@/components/dashboard/bento-grid"
import { StatTile } from "@/components/dashboard/stat-tile"
import { TablePagination } from "@/components/dashboard/table-pagination"
import {
  useRunScrapeSourceNow,
  useScrapeSources,
  useUpdateScrapeSource,
} from "@/lib/api/hooks/use-scrape-sources"
import { useMerchants } from "@/lib/api/hooks/use-merchants"
import { ApiError } from "@/lib/api/client"
import { relativeTime } from "@/lib/relative-time"
import { usePagination } from "@/hooks/use-pagination"
import type { ScrapeSource } from "@/lib/api/types"
import { ScrapeSourceDialog } from "./scrape-source-dialog"

export default function ScrapeSourcesPage() {
  const { data: sources, isLoading, isError } = useScrapeSources()
  const { data: merchants } = useMerchants()
  const { page, setPage, pageCount, pageItems, totalItems, pageSize } = usePagination(sources)

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
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Scrape Sources</h2>
          <p className="text-sm text-muted-foreground">
            Pages the scraper checks on a schedule for new coupon codes.
          </p>
        </div>
        <ScrapeSourceDialog merchants={merchants} />
      </div>

      <BentoGrid>
        <StatTile label="Total sources" value={stats.total} icon={<DatabaseIcon />} />
        <StatTile label="Active" value={stats.active} icon={<CircleCheckIcon />} />
      </BentoGrid>

      {isError && <p className="text-sm text-destructive">Could not load scrape sources.</p>}

      <div className="flex flex-col gap-2">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>URL</TableHead>
              <TableHead>Merchant</TableHead>
              <TableHead>Every</TableHead>
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

            {!isLoading && sources?.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground">
                  No scrape sources yet.
                </TableCell>
              </TableRow>
            )}

            {pageItems.map((source, index) => (
              <ScrapeSourceRow
                key={source.id}
                source={source}
                index={index}
                merchantName={source.merchantId ? merchantNameById.get(source.merchantId) : undefined}
                merchants={merchants}
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
  merchants,
}: {
  source: ScrapeSource
  index: number
  merchantName?: string
  merchants: ReturnType<typeof useMerchants>["data"]
}) {
  const updateSource = useUpdateScrapeSource(source.id)
  const runNow = useRunScrapeSourceNow()

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
          <ScrapeSourceDialog merchants={merchants} source={source} />
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={handleRunNow}
            disabled={runNow.isPending}
            aria-label="Run now"
          >
            <PlayIcon className="size-3.5" />
          </Button>
        </TableRowActions>
      </TableCell>
    </TableRow>
  )
}
