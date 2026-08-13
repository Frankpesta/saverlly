"use client"

import * as React from "react"
import Link from "next/link"
import { motion } from "motion/react"
import { MegaphoneIcon, CircleCheckIcon, RadioIcon } from "lucide-react"
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
import { useKiosks } from "@/lib/api/hooks/use-kiosks"
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

export default function AdminAnnouncementsPage() {
  const { data: announcements, isLoading, isError } = useAnnouncements()
  const { data: kiosks } = useKiosks()
  const { data: locations } = useLocations()
  const { page, setPage, pageCount, pageItems, totalItems, pageSize } = usePagination(announcements)

  const [now, setNow] = React.useState(() => Date.now())
  React.useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 60_000)
    return () => clearInterval(interval)
  }, [])

  const kioskNameById = React.useMemo(() => {
    const map = new Map<string, string>()
    for (const kiosk of kiosks ?? []) map.set(kiosk.id, kiosk.name)
    return map
  }, [kiosks])

  const locationCountByKiosk = React.useMemo(() => {
    const counts = new Map<string, number>()
    for (const location of locations ?? []) {
      counts.set(location.kioskId, (counts.get(location.kioskId) ?? 0) + 1)
    }
    return counts
  }, [locations])

  const stats = React.useMemo(() => {
    const list = announcements ?? []
    const active = list.filter((a) => statusFor(a, now) === "Active").length
    const broadcasts = list.filter((a) => a.kioskId === null).length
    return { total: list.length, active, broadcasts }
  }, [announcements, now])

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Announcements</h2>
          <p className="text-sm text-muted-foreground">
            Every announcement across every kiosk business, plus platform-wide broadcasts.
          </p>
        </div>
        <NewAnnouncementDialog />
      </div>

      <BentoGrid>
        <StatTile label="Total announcements" value={stats.total} icon={<MegaphoneIcon />} />
        <StatTile label="Active now" value={stats.active} icon={<CircleCheckIcon />} />
        <StatTile label="Broadcasts" value={stats.broadcasts} icon={<RadioIcon />} />
      </BentoGrid>

      {isError && <p className="text-sm text-destructive">Could not load announcements.</p>}

      <div className="overflow-hidden rounded-2xl border border-black/8">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Title</TableHead>
              <TableHead>Kiosk</TableHead>
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
                  <TableCell colSpan={6}>
                    <Skeleton className="h-6 w-full" />
                  </TableCell>
                </TableRow>
              ))}

            {!isLoading && announcements?.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground">
                  No announcements yet.
                </TableCell>
              </TableRow>
            )}

            {pageItems.map((announcement, index) => {
              const status = statusFor(announcement, now)
              const isBroadcast = announcement.kioskId === null
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
                      href={`/admin/announcements/${announcement.id}`}
                      className="hover:underline"
                    >
                      {announcement.title}
                    </Link>
                  </TableCell>
                  <TableCell>
                    {isBroadcast ? (
                      <Badge variant="default" className="gap-1">
                        <RadioIcon className="size-3" />
                        All kiosks
                      </Badge>
                    ) : (
                      (kioskNameById.get(announcement.kioskId ?? "") ?? "—")
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant={STATUS_BADGE_VARIANT[status]}>{status}</Badge>
                  </TableCell>
                  <TableCell>{REPEAT_LABEL[announcement.repeatPolicy]}</TableCell>
                  <TableCell>
                    {isBroadcast
                      ? "Everyone"
                      : announcement.locationIds.length === 0
                        ? `All locations (${locationCountByKiosk.get(announcement.kioskId ?? "") ?? 0})`
                        : `${announcement.locationIds.length} of ${locationCountByKiosk.get(announcement.kioskId ?? "") ?? "…"}`}
                  </TableCell>
                  <TableCell>
                    <Link
                      href={`/admin/announcements/${announcement.id}`}
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
