"use client"

import * as React from "react"
import { motion } from "motion/react"
import { LinkIcon, ZapIcon } from "lucide-react"
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
import { useAffiliatePrograms } from "@/lib/api/hooks/use-affiliate-programs"
import { usePagination } from "@/hooks/use-pagination"
import { AffiliateProgramDialog } from "./affiliate-program-dialog"

export default function AffiliateProgramsPage() {
  const { data: programs, isLoading, isError } = useAffiliatePrograms()
  const { page, setPage, pageCount, pageItems, totalItems, pageSize } = usePagination(programs)

  const stats = React.useMemo(() => {
    const list = programs ?? []
    return { total: list.length, withApi: list.filter((p) => p.hasCouponApi).length }
  }, [programs])

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Affiliate Programs</h2>
          <p className="text-sm text-muted-foreground">
            Networks merchants can connect to for automatic coupon sourcing.
          </p>
        </div>
        <AffiliateProgramDialog />
      </div>

      <BentoGrid>
        <StatTile label="Total programs" value={stats.total} icon={<LinkIcon />} />
        <StatTile label="With coupon API" value={stats.withApi} icon={<ZapIcon />} />
      </BentoGrid>

      {isError && <p className="text-sm text-destructive">Could not load affiliate programs.</p>}

      <div className="overflow-hidden rounded-2xl border border-black/8">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Network</TableHead>
              <TableHead>Program ID</TableHead>
              <TableHead>Coupon API</TableHead>
              <TableHead>Credentials</TableHead>
              <TableHead className="w-16" />
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

            {!isLoading && programs?.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground">
                  No affiliate programs yet.
                </TableCell>
              </TableRow>
            )}

            {pageItems.map((program, index) => (
              <motion.tr
                key={program.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25, delay: index * 0.03 }}
                className="border-b border-black/6 transition-colors last:border-0 hover:bg-[var(--brand-teal-tint)]/50"
              >
                <TableCell className="font-medium">{program.networkName}</TableCell>
                <TableCell>{program.programId ?? "—"}</TableCell>
                <TableCell>
                  <Badge variant={program.hasCouponApi ? "default" : "secondary"}>
                    {program.hasCouponApi ? "Yes" : "No"}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Badge variant={program.hasCredentials ? "default" : "outline"}>
                    {program.hasCredentials ? "Configured" : "None"}
                  </Badge>
                </TableCell>
                <TableCell>
                  <AffiliateProgramDialog program={program} />
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
      </div>
    </div>
  )
}
