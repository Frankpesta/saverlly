"use client"

import { InlineQueryError } from "@/components/dashboard/query-state"
import { ScrapeError } from "@/components/dashboard/scrape-error"
import { ScrapeSourceStatusBadge, scrapeSiteLabel } from "@/components/dashboard/scrape-source-site"

import * as React from "react"
import Link from "next/link"
import { toast } from "sonner"
import { PencilIcon, PlayIcon, PlusIcon } from "lucide-react"
import { COUPON_SITES, type CouponSiteInfo } from "@saverlly/shared-types"
import { Button, buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
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
import {
  useCreateScrapeSource,
  useRunScrapeSourceNow,
  useScrapeSources,
  useUpdateScrapeSource,
} from "@/lib/api/hooks/use-scrape-sources"
import { ApiError } from "@/lib/api/client"
import { relativeTime } from "@/lib/relative-time"
import type { ScrapeSource } from "@/lib/api/types"
import { cn } from "@/lib/utils"

const COLUMNS = 5

/** One row per built-in coupon site (set up automatically for every merchant), then any custom
 * pages an admin added. */
export function MerchantScrapeSourcesSection({ merchantId }: { merchantId: string }) {
  const { data: allSources, isLoading, isError, refetch } = useScrapeSources()

  const sources = React.useMemo(
    () => (allSources ?? []).filter((s) => s.merchantId === merchantId),
    [allSources, merchantId],
  )
  const custom = sources.filter((s) => s.strategy === "GENERIC_CSS")

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Scrape sources</CardTitle>
        <Link
          href={`/admin/scrape-sources/new?merchantId=${merchantId}`}
          className={cn(buttonVariants({ variant: "outline", size: "sm" }), "gap-1.5")}
        >
          <PlusIcon className="size-4" />
          New Scrape Source
        </Link>
      </CardHeader>
      <CardContent>
        {isError && <InlineQueryError message="Could not load scrape sources." onRetry={refetch} />}

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Site</TableHead>
              <TableHead>Page</TableHead>
              <TableHead>Last run</TableHead>
              <TableHead>Active</TableHead>
              <TableHead className="w-32" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading &&
              Array.from({ length: 2 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell colSpan={COLUMNS}>
                    <Skeleton className="h-6 w-full" />
                  </TableCell>
                </TableRow>
              ))}

            {!isLoading &&
              COUPON_SITES.map((site, index) => {
                const source = sources.find((s) => s.strategy === site.strategy)
                return source ? (
                  <SourceRow key={site.strategy} source={source} index={index} />
                ) : (
                  <MissingSiteRow
                    key={site.strategy}
                    site={site}
                    merchantId={merchantId}
                    index={index}
                  />
                )
              })}

            {custom.map((source, index) => (
              <SourceRow key={source.id} source={source} index={COUPON_SITES.length + index} />
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}

function SourceRow({ source, index }: { source: ScrapeSource; index: number }) {
  const updateSource = useUpdateScrapeSource(source.id)
  const runNow = useRunScrapeSourceNow()
  const notListed = source.status === "NOT_LISTED"

  function toggleActive() {
    updateSource.mutate(
      { active: !source.active },
      {
        onError: (error) =>
          toast.error(
            error instanceof ApiError ? error.message : "Could not update scrape source.",
          ),
      },
    )
  }

  function handleRunNow() {
    runNow.mutate(source.id, {
      onSuccess: () => toast.success(notListed ? "Check queued." : "Scrape queued."),
      onError: (error) =>
        toast.error(error instanceof ApiError ? error.message : "Could not queue scrape."),
    })
  }

  return (
    <TableRow index={index} className={cn(notListed && "text-muted-foreground")}>
      <TableCell>
        <div className="flex flex-col items-start gap-1">
          <span className="font-medium">{scrapeSiteLabel(source)}</span>
          <ScrapeSourceStatusBadge source={source} />
        </div>
      </TableCell>
      <TableCell className="max-w-48 truncate" title={source.url}>
        {source.url}
      </TableCell>
      <TableCell>
        {source.lastRunAt ? relativeTime(source.lastRunAt) : "Never"}
        {source.lastError && <ScrapeError message={source.lastError} />}
        {source.lastSucceededAt && (
          <p className="text-xs text-muted-foreground">
            Last success {relativeTime(source.lastSucceededAt)} · {source.lastCodeCount ?? 0} codes
            in latest run
          </p>
        )}
      </TableCell>
      <TableCell>
        <Switch
          checked={source.active}
          onCheckedChange={toggleActive}
          disabled={updateSource.isPending}
          aria-label={`Toggle ${scrapeSiteLabel(source)} source`}
        />
      </TableCell>
      <TableCell>
        <TableRowActions>
          <Link
            href={`/admin/scrape-sources/${source.id}`}
            className={cn(
              buttonVariants({ variant: "ghost", size: "icon-sm" }),
              "text-muted-foreground hover:text-foreground",
            )}
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
            disabled={runNow.isPending || !source.active}
            aria-label={notListed ? "Check now" : "Run now"}
            title={notListed ? "Check whether the site lists this store now" : undefined}
          >
            <PlayIcon className="size-3.5" />
          </Button>
        </TableRowActions>
      </TableCell>
    </TableRow>
  )
}

/** A coupon site this merchant has no source on: switched off everywhere when it was created,
 * or deleted by an admin. */
function MissingSiteRow({
  site,
  merchantId,
  index,
}: {
  site: CouponSiteInfo
  merchantId: string
  index: number
}) {
  const createSource = useCreateScrapeSource()

  function add() {
    createSource.mutate(
      { strategy: site.strategy, merchantId },
      {
        onSuccess: () => toast.success(`${site.label} source added.`),
        onError: (error) =>
          toast.error(
            error instanceof ApiError ? error.message : `Could not add the ${site.label} source.`,
          ),
      },
    )
  }

  return (
    <TableRow index={index} className="text-muted-foreground">
      <TableCell className="font-medium">{site.label}</TableCell>
      <TableCell colSpan={COLUMNS - 2}>Not set up for this merchant.</TableCell>
      <TableCell>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={add}
          disabled={createSource.isPending}
        >
          Add
        </Button>
      </TableCell>
    </TableRow>
  )
}
