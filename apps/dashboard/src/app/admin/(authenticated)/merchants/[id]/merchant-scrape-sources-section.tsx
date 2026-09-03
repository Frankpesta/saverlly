"use client"

import * as React from "react"
import Link from "next/link"
import { toast } from "sonner"
import { PencilIcon, PlayIcon, PlusIcon } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button, buttonVariants } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableRowActions,
} from "@/components/ui/table"
import { TablePagination } from "@/components/dashboard/table-pagination"
import { useRunScrapeSourceNow, useScrapeSources } from "@/lib/api/hooks/use-scrape-sources"
import { ApiError } from "@/lib/api/client"
import { relativeTime } from "@/lib/relative-time"
import { usePagination } from "@/hooks/use-pagination"
import { cn } from "@/lib/utils"

export function MerchantScrapeSourcesSection({ merchantId }: { merchantId: string }) {
  const { data: allSources, isLoading, isError } = useScrapeSources()
  const runNow = useRunScrapeSourceNow()

  const sources = React.useMemo(
    () => (allSources ?? []).filter((s) => s.merchantId === merchantId),
    [allSources, merchantId],
  )
  const { page, setPage, pageCount, pageItems, totalItems, pageSize } = usePagination(sources)

  function handleRunNow(id: string) {
    runNow.mutate(id, {
      onSuccess: () => toast.success("Scrape queued."),
      onError: (error) =>
        toast.error(error instanceof ApiError ? error.message : "Could not queue scrape."),
    })
  }

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
        {isError && <p className="text-sm text-destructive">Could not load scrape sources.</p>}

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>URL</TableHead>
              <TableHead>Last run</TableHead>
              <TableHead className="w-32" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading &&
              Array.from({ length: 2 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell colSpan={3}>
                    <Skeleton className="h-6 w-full" />
                  </TableCell>
                </TableRow>
              ))}

            {!isLoading && sources.length === 0 && (
              <TableRow>
                <TableCell colSpan={3} className="text-center text-muted-foreground">
                  No scrape sources yet.
                </TableCell>
              </TableRow>
            )}

            {pageItems.map((source, index) => (
              <TableRow key={source.id} index={index}>
                <TableCell className="max-w-48 truncate font-medium" title={source.url}>
                  {source.url}
                </TableCell>
                <TableCell>
                  {source.lastRunAt ? relativeTime(source.lastRunAt) : "Never"}{" "}
                  {!source.active && <Badge variant="secondary">Inactive</Badge>}
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
                      onClick={() => handleRunNow(source.id)}
                      disabled={runNow.isPending}
                      aria-label="Run now"
                    >
                      <PlayIcon className="size-3.5" />
                    </Button>
                  </TableRowActions>
                </TableCell>
              </TableRow>
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
      </CardContent>
    </Card>
  )
}
