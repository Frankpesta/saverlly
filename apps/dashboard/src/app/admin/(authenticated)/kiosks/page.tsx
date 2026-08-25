"use client"

import * as React from "react"
import Link from "next/link"
import { toast } from "sonner"
import { PencilIcon } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"
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
import { TablePagination } from "@/components/dashboard/table-pagination"
import { CollectionArea, CollectionSummary, WorkspaceHeader } from "@/components/dashboard/page-layout"
import { useKiosks, useUpdateKioskStatus } from "@/lib/api/hooks/use-kiosks"
import { ApiError } from "@/lib/api/client"
import { usePagination } from "@/hooks/use-pagination"
import { KIOSK_STATUS_BADGE_VARIANT, KIOSK_STATUS_LABEL } from "@/lib/dashboard/status-labels"
import { cn } from "@/lib/utils"
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
    <div className="flex flex-col gap-6">
      <WorkspaceHeader
        eyebrow="Platform network"
        title="Kiosks"
        description="Every kiosk business on the platform, their status, and revenue share."
        actions={<NewKioskDialog />}
      />

      <CollectionSummary items={[
        { label: "Kiosks", value: stats.total, detail: "Registered businesses" },
        { label: "Active", value: stats.active, detail: `${stats.active} of ${stats.total} kiosks active` },
        { label: "Avg. revenue share", value: `${stats.avgShare.toFixed(1)}%`, detail: "Across all kiosks" },
      ]} />

      {isError && <p className="text-sm text-destructive">Could not load kiosks.</p>}

      <CollectionArea title="Kiosk directory" description="Manage status and revenue sharing for each kiosk business." count={totalItems}>
        <div className="flex flex-col gap-2">
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
              <TableRow key={kiosk.id} index={index}>
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
                    <Badge variant={KIOSK_STATUS_BADGE_VARIANT[kiosk.status]}>
                      {KIOSK_STATUS_LABEL[kiosk.status]}
                    </Badge>
                  </div>
                </TableCell>
                <TableCell>{kiosk.revenueSharePct}%</TableCell>
                <TableCell>{kiosk.contactEmail}</TableCell>
                <TableCell>
                  <TableRowActions>
                    <Link
                      href={`/admin/kiosks/${kiosk.id}`}
                      className={cn(buttonVariants({ variant: "ghost", size: "icon-sm" }), "text-muted-foreground hover:text-foreground")}
                      aria-label={`Edit ${kiosk.name}`}
                    >
                      <PencilIcon className="size-3.5" />
                    </Link>
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
        </div>
      </CollectionArea>
    </div>
  )
}
