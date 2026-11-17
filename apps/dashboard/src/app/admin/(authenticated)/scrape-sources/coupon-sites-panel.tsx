"use client"

import { InlineQueryError } from "@/components/dashboard/query-state"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { useCouponSiteHealth } from "@/lib/api/hooks/use-scrape-sources"
import { relativeTime } from "@/lib/relative-time"
import { cn } from "@/lib/utils"

/** How each coupon site has behaved over the last 24 hours, so a site locking the scrapers out
 * shows up here instead of as merchants quietly running out of codes. */
export function CouponSitesPanel() {
  const { data: sites, isLoading, isError, refetch } = useCouponSiteHealth()

  return (
    <Card>
      <CardHeader>
        <CardTitle>Coupon sites · last 24 hours</CardTitle>
      </CardHeader>
      <CardContent>
        {isError && <InlineQueryError message="Could not load coupon sites." onRetry={refetch} />}
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Site</TableHead>
              <TableHead className="text-right">Succeeded</TableHead>
              <TableHead className="text-right">Blocked</TableHead>
              <TableHead className="text-right">Not listed</TableHead>
              <TableHead className="text-right">Failed</TableHead>
              <TableHead className="text-right">Codes found</TableHead>
              <TableHead>Last success</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading &&
              Array.from({ length: 3 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell colSpan={7}>
                    <Skeleton className="h-6 w-full" />
                  </TableCell>
                </TableRow>
              ))}
            {sites?.map((site) => (
              <TableRow key={site.strategy}>
                <TableCell>
                  <div className="flex flex-col items-start gap-1">
                    <span className="font-medium">{site.label}</span>
                    {site.pausedUntil && (
                      <Badge
                        variant="destructive"
                        title="Several stores on this site were blocked within an hour, so the whole site is left alone for a while."
                      >
                        Paused {relativeTime(site.pausedUntil).replace(/^in /, "for ")}
                      </Badge>
                    )}
                  </div>
                </TableCell>
                <TableCell className="text-right tabular-nums">{site.runs.succeeded}</TableCell>
                <TableCell
                  className={cn(
                    "text-right tabular-nums",
                    site.runs.blocked > 0 && "font-medium text-destructive",
                  )}
                >
                  {site.runs.blocked}
                </TableCell>
                <TableCell className="text-right tabular-nums">{site.runs.notListed}</TableCell>
                <TableCell
                  className={cn(
                    "text-right tabular-nums",
                    site.runs.failed > 0 && "font-medium text-destructive",
                  )}
                >
                  {site.runs.failed}
                </TableCell>
                <TableCell className="text-right tabular-nums">{site.codesFound}</TableCell>
                <TableCell>
                  {site.lastSucceededAt ? relativeTime(site.lastSucceededAt) : "Never"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}
