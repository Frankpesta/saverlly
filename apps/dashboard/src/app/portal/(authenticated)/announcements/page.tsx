"use client"

import * as React from "react"
import Link from "next/link"
import { motion } from "motion/react"
import { MegaphoneIcon, CircleCheckIcon, ClockIcon } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { BentoGrid } from "@/components/dashboard/bento-grid"
import { StatTile } from "@/components/dashboard/stat-tile"
import { TablePagination } from "@/components/dashboard/table-pagination"
import { useAnnouncements } from "@/lib/api/hooks/use-announcements"
import { useLocations } from "@/lib/api/hooks/use-locations"
import { usePagination } from "@/hooks/use-pagination"
import type { Announcement, AnnouncementRepeatPolicy } from "@/lib/api/types"
import { NewAnnouncementDialog } from "./new-announcement-dialog"

const REPEAT_LABEL: Record<AnnouncementRepeatPolicy, string> = {
  ONCE: "Once",
  EVERY_LOGIN: "Every login",
  MAX_N_TIMES: "Max N times",
}

function statusFor(announcement: Announcement, now: number): "Scheduled" | "Active" | "Expired" {
  const start = new Date(announcement.startAt).getTime()
  const end = new Date(announcement.endAt).getTime()
  if (now < start) return "Scheduled"
  if (now > end) return "Expired"
  return "Active"
}

const STATUS_BADGE_VARIANT = {
  Scheduled: "secondary",
  Active: "default",
  Expired: "secondary",
} as const

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

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Announcements</h2>
          <p className="text-sm text-muted-foreground">
            Ads and messages shown to customers on the kiosk screen.
          </p>
        </div>
        <NewAnnouncementDialog />
      </div>

      <BentoGrid>
        <StatTile label="Total announcements" value={stats.total} icon={<MegaphoneIcon />} />
        <StatTile label="Active now" value={stats.active} icon={<CircleCheckIcon />} />
        <StatTile label="Scheduled" value={stats.scheduled} icon={<ClockIcon />} />
      </BentoGrid>

      {isError && <p className="text-sm text-destructive">Could not load announcements.</p>}

      <div className="overflow-hidden rounded-2xl border border-black/8">
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
                  No announcements yet.
                </TableCell>
              </TableRow>
            )}

            {pageItems.map((announcement, index) => {
              const status = statusFor(announcement, now)
              return (
                <motion.tr
                  key={announcement.id}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.25, delay: index * 0.03 }}
                  className="border-b border-black/6 transition-colors last:border-0 hover:bg-[var(--brand-teal-tint)]/50"
                >
                  <TableCell className="font-medium">
                    <Link
                      href={`/portal/announcements/${announcement.id}`}
                      className="hover:underline"
                    >
                      {announcement.title}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <Badge variant={STATUS_BADGE_VARIANT[status]}>{status}</Badge>
                  </TableCell>
                  <TableCell>{REPEAT_LABEL[announcement.repeatPolicy]}</TableCell>
                  <TableCell>
                    {announcement.locationIds.length === 0
                      ? "All locations"
                      : `${announcement.locationIds.length} of ${locations?.length ?? "…"}`}
                  </TableCell>
                  <TableCell>
                    <Link
                      href={`/portal/announcements/${announcement.id}`}
                      className="text-sm text-muted-foreground hover:underline"
                    >
                      Edit
                    </Link>
                  </TableCell>
                </motion.tr>
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
