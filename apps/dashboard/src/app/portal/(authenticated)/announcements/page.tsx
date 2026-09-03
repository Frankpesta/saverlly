"use client"

import * as React from "react"
import Link from "next/link"
import { MegaphoneIcon, CircleCheckIcon, ClockIcon, PencilIcon, PlusIcon } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"
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
import { BentoGrid } from "@/components/dashboard/bento-grid"
import { StatTile } from "@/components/dashboard/stat-tile"
import { TablePagination } from "@/components/dashboard/table-pagination"
import { useAnnouncements } from "@/lib/api/hooks/use-announcements"
import { useLocations } from "@/lib/api/hooks/use-locations"
import { usePagination } from "@/hooks/use-pagination"
import type { Announcement, AnnouncementRepeatPolicy } from "@/lib/api/types"
import { ANNOUNCEMENT_STATUS_BADGE_VARIANT, type AnnouncementStatus } from "@/lib/dashboard/status-labels"
import { monthOverMonthGrowth } from "@/lib/dashboard/aggregate"
import { cn } from "@/lib/utils"

const REPEAT_LABEL: Record<AnnouncementRepeatPolicy, string> = {
  ONCE: "Once",
  EVERY_LOGIN: "Every login",
  MAX_N_TIMES: "Max N times",
}

function statusFor(announcement: Announcement, now: number): AnnouncementStatus {
  const start = new Date(announcement.startAt).getTime()
  const end = new Date(announcement.endAt).getTime()
  if (now < start) return "Scheduled"
  if (now > end) return "Expired"
  return "Active"
}

export default function AnnouncementsPage() {
  const { data: announcements, isLoading, isError } = useAnnouncements()
  const { data: locations } = useLocations()
  const { page, setPage, pageCount, pageItems, totalItems, pageSize } = usePagination(announcements)

  const [now, setNow] = React.useState(() => Date.now())
  React.useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 60_000)
    return () => clearInterval(interval)
  }, [])

  const stats = React.useMemo(() => {
    const list = announcements ?? []
    const active = list.filter((a) => statusFor(a, now) === "Active").length
    const scheduled = list.filter((a) => statusFor(a, now) === "Scheduled").length
    return { total: list.length, active, scheduled }
  }, [announcements, now])

  const totalGrowth = React.useMemo(
    () => monthOverMonthGrowth(announcements ?? [], (a) => a.createdAt, () => 1),
    [announcements],
  )

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-title">Announcements</h2>
          <p className="text-sm text-muted-foreground">
            Ads and messages shown to customers on the kiosk screen.
          </p>
        </div>
        <Link href="/portal/announcements/new" className={cn(buttonVariants(), "gap-1.5")}>
          <PlusIcon className="size-4" />
          New Announcement
        </Link>
      </div>

      <BentoGrid>
        <StatTile
          label="Total announcements"
          value={stats.total}
          icon={<MegaphoneIcon />}
          delta={totalGrowth}
          subtext={totalGrowth !== null ? "vs last month" : undefined}
        />
        <StatTile label="Active now" value={stats.active} icon={<CircleCheckIcon />} />
        <StatTile label="Scheduled" value={stats.scheduled} icon={<ClockIcon />} />
      </BentoGrid>

      {isError && <p className="text-sm text-destructive">Could not load announcements.</p>}

      <div className="flex flex-col gap-2">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Title</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Repeat</TableHead>
              <TableHead>Locations</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading &&
              Array.from({ length: 3 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell colSpan={5}>
                    <Skeleton className="h-6 w-full" />
                  </TableCell>
                </TableRow>
              ))}

            {!isLoading && announcements?.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground">
                  No announcements yet.{" "}
                  <Link href="/portal/announcements/new" className="underline hover:text-foreground">
                    Create your first one
                  </Link>
                  .
                </TableCell>
              </TableRow>
            )}

            {pageItems.map((announcement, index) => {
              const status = statusFor(announcement, now)
              return (
                <TableRow key={announcement.id} index={index}>
                  <TableCell className="font-medium">
                    <Link
                      href={`/portal/announcements/${announcement.id}`}
                      className="hover:underline"
                    >
                      {announcement.title}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <Badge variant={ANNOUNCEMENT_STATUS_BADGE_VARIANT[status]}>{status}</Badge>
                  </TableCell>
                  <TableCell>{REPEAT_LABEL[announcement.repeatPolicy]}</TableCell>
                  <TableCell>
                    {announcement.locationIds.length === 0
                      ? "All locations"
                      : `${announcement.locationIds.length} of ${locations?.length ?? "…"}`}
                  </TableCell>
                  <TableCell>
                    <TableRowActions>
                      <Link
                        href={`/portal/announcements/${announcement.id}`}
                        className={cn(buttonVariants({ variant: "ghost", size: "icon-sm" }), "text-muted-foreground hover:text-foreground")}
                        aria-label={`Edit ${announcement.title}`}
                      >
                        <PencilIcon className="size-3.5" />
                      </Link>
                    </TableRowActions>
                  </TableCell>
                </TableRow>
              )
            })}
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
