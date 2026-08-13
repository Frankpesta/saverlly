"use client"

import * as React from "react"
import Link from "next/link"
import { motion } from "motion/react"
import { toast } from "sonner"
import { StoreIcon, CircleCheckIcon, CirclePauseIcon, PercentIcon } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
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
import { Meter } from "@/components/dashboard/meter"
import { TablePagination } from "@/components/dashboard/table-pagination"
import { useKiosks, useUpdateKioskStatus } from "@/lib/api/hooks/use-kiosks"
import { ApiError } from "@/lib/api/client"
import { usePagination } from "@/hooks/use-pagination"
import { NewKioskDialog } from "./new-kiosk-dialog"

export default function KiosksPage() {
  const { data: kiosks, isLoading, isError } = useKiosks()
  const updateStatus = useUpdateKioskStatus()
  const { page, setPage, pageCount, pageItems, totalItems, pageSize } = usePagination(kiosks)

  const stats = React.useMemo(() => {
    const list = kiosks ?? []
    const active = list.filter((k) => k.status === "ACTIVE").length
    const avgShare =
      list.length === 0
        ? 0
        : list.reduce((sum, k) => sum + Number(k.revenueSharePct), 0) / list.length
    return { total: list.length, active, inactive: list.length - active, avgShare }
  }, [kiosks])

  function toggleStatus(id: string, current: "ACTIVE" | "INACTIVE") {
    const next = current === "ACTIVE" ? "INACTIVE" : "ACTIVE"
    updateStatus.mutate(
      { id, status: next },
      {
        onError: (error) =>
          toast.error(
            error instanceof ApiError ? error.message : "Could not update kiosk status.",
          ),
      },
    )
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-5 rounded-3xl border border-[var(--brand-teal-soft)] bg-[linear-gradient(120deg,#ffffff_0%,#f0faf8_100%)] p-6 sm:flex-row sm:items-end sm:justify-between sm:p-8">
        <div className="max-w-2xl">
          <p className="mb-2 text-xs font-semibold tracking-[0.16em] text-[var(--brand-teal)] uppercase">Business network</p>
          <h2 className="text-3xl font-semibold tracking-[-0.04em]">Kiosks</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Every kiosk business on the platform, their status, and revenue share.
          </p>
        </div>
        <NewKioskDialog />
      </div>

      <BentoGrid>
        <StatTile label="Total kiosks" value={stats.total} icon={<StoreIcon />} />
        <StatTile label="Active" value={stats.active} icon={<CircleCheckIcon />} />
        <StatTile label="Inactive" value={stats.inactive} icon={<CirclePauseIcon />} />
        <StatTile
          label="Avg. revenue share"
          value={stats.avgShare}
          icon={<PercentIcon />}
          format={(n) => `${n.toFixed(1)}%`}
        />
        <Meter
          label="Kiosks active"
          value={stats.active}
          max={stats.total}
          caption={`${stats.active} of ${stats.total} kiosks active`}
        />
      </BentoGrid>

      {isError && <p className="text-sm text-destructive">Could not load kiosks.</p>}

      <section className="overflow-hidden rounded-2xl border border-black/[0.06] bg-card shadow-[0_8px_24px_rgba(11,11,11,0.04)]">
        <div className="flex flex-col gap-1 border-b border-border/70 px-5 py-4 sm:px-6">
          <h3 className="font-semibold tracking-tight">All kiosks</h3>
          <p className="text-sm text-muted-foreground">Manage status and revenue sharing for each kiosk business.</p>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Revenue Share</TableHead>
              <TableHead>Contact Email</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading &&
              Array.from({ length: 4 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell colSpan={5}>
                    <Skeleton className="h-6 w-full" />
                  </TableCell>
                </TableRow>
              ))}

            {!isLoading && kiosks?.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground">
                  No kiosks yet.
                </TableCell>
              </TableRow>
            )}

            {pageItems.map((kiosk, index) => (
              <motion.tr
                key={kiosk.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25, delay: index * 0.03 }}
                className="border-b border-black/6 transition-colors last:border-0 hover:bg-[var(--brand-teal-tint)]/50"
              >
                <TableCell className="font-medium">
                  <Link href={`/admin/kiosks/${kiosk.id}`} className="hover:underline">
                    {kiosk.name}
                  </Link>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={kiosk.status === "ACTIVE"}
                      onCheckedChange={() => toggleStatus(kiosk.id, kiosk.status)}
                      disabled={updateStatus.isPending}
                      aria-label={`Toggle ${kiosk.name} status`}
                    />
                    <Badge variant={kiosk.status === "ACTIVE" ? "default" : "secondary"}>
                      {kiosk.status}
                    </Badge>
                  </div>
                </TableCell>
                <TableCell>{kiosk.revenueSharePct}%</TableCell>
                <TableCell>{kiosk.contactEmail}</TableCell>
                <TableCell>
                  <Link
                    href={`/admin/kiosks/${kiosk.id}`}
                    className="text-sm text-muted-foreground hover:underline"
                  >
                    Edit
                  </Link>
                </TableCell>
              </motion.tr>
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
      </section>
    </div>
  )
}
