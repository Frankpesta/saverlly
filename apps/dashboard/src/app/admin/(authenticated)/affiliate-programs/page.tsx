"use client"

import { InlineQueryError } from "@/components/dashboard/query-state"

import * as React from "react"
import Link from "next/link"
import { toast } from "sonner"
import { PencilIcon, PlusIcon } from "lucide-react"
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
import { CollectionSummary } from "@/components/dashboard/page-layout"
import { DeleteRowButton } from "@/components/dashboard/delete-row-button"
import { TablePagination } from "@/components/dashboard/table-pagination"
import { useAffiliatePrograms, useDeleteAffiliateProgram } from "@/lib/api/hooks/use-affiliate-programs"
import { ApiError } from "@/lib/api/client"
import { useCollectionView } from "@/hooks/use-collection-view"
import { CollectionToolbar } from "@/components/dashboard/collection-toolbar"
import { usePagination } from "@/hooks/use-pagination"
import { cn } from "@/lib/utils"

export default function AffiliateProgramsPage() {
  const { data: programs, isLoading, isError, refetch } = useAffiliatePrograms()
  const view = useCollectionView(programs, {
    searchText: (item) => [item.networkName, item.programId].join(" "),
    sorts: [{ label: "Name: A to Z", value: "name", compare: (a, b) => a.networkName.localeCompare(b.networkName, undefined, { numeric: true }) }],
    filters: [{ label: "With coupon API", value: "active", matches: (item) => item.hasCouponApi }, { label: "Without coupon API", value: "inactive", matches: (item) => !(item.hasCouponApi) }],
  })
  const { page, setPage, pageCount, pageItems, totalItems, pageSize } = usePagination(view.items, undefined, view.resetKey)
  const deleteProgram = useDeleteAffiliateProgram()

  function handleDelete(id: string) {
    deleteProgram.mutate(id, {
      onSuccess: () => toast.success("Affiliate program deleted."),
      onError: (error) =>
        toast.error(error instanceof ApiError ? error.message : "Could not delete affiliate program."),
    })
  }

  const stats = React.useMemo(() => {
    const list = programs ?? []
    return { total: list.length, withApi: list.filter((p) => p.hasCouponApi).length }
  }, [programs])

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-border pb-5">
        <div>
          <h1 className="text-title">Affiliate Programs</h1>
          <p className="text-sm text-muted-foreground">
            Networks merchants can connect to for automatic coupon sourcing.
          </p>
        </div>
        <Link href="/admin/affiliate-programs/new" className={cn(buttonVariants(), "gap-1.5")}>
          <PlusIcon className="size-4" />
          New Program
        </Link>
      </div>

      <CollectionSummary isLoading={isLoading} isError={isError} items={[{ label: "Programs", value: stats.total }, { label: "With coupon API", value: stats.withApi }]} />

      <CollectionToolbar view={view} label="Affiliate programs" />

      {isError && <InlineQueryError message="Could not load affiliate programs." onRetry={refetch} />}

      <div className="flex flex-col gap-2">
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

            {!isLoading && !isError && view.items.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground">
                  {view.hasFilters ? "No records match your search or filters." : "No affiliate programs yet."}
                </TableCell>
              </TableRow>
            )}

            {pageItems.map((program, index) => (
              <TableRow key={program.id} index={index}>
                <TableCell className="font-medium">{program.networkName}</TableCell>
                <TableCell>{program.programId ?? "Not set"}</TableCell>
                <TableCell>
                  <Badge variant={program.hasCouponApi ? "success" : "secondary"}>
                    {program.hasCouponApi ? "Yes" : "No"}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Badge variant={program.hasCredentials ? "info" : "outline"}>
                    {program.hasCredentials ? "Configured" : "None"}
                  </Badge>
                </TableCell>
                <TableCell>
                  <TableRowActions>
                    <Link
                      href={`/admin/affiliate-programs/${program.id}`}
                      className={cn(buttonVariants({ variant: "ghost", size: "icon-sm" }), "text-muted-foreground hover:text-foreground")}
                      aria-label={`Edit ${program.networkName}`}
                    >
                      <PencilIcon className="size-3.5" />
                    </Link>
                    <DeleteRowButton
                      itemLabel={program.networkName}
                      description="Merchants still linked to this program will need a new one before you can delete it."
                      onConfirm={() => handleDelete(program.id)}
                      isPending={deleteProgram.isPending}
                    />
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
    </div>
  )
}
