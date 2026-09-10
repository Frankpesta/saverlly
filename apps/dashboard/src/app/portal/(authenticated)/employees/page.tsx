"use client"

import { InlineQueryError } from "@/components/dashboard/query-state"

import * as React from "react"
import { toast } from "sonner"
import { PencilIcon, UserPlusIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableEmptyRow,
  TableHead,
  TableHeader,
  TableRow,
  TableRowActions,
} from "@/components/ui/table"
import { DeleteRowButton } from "@/components/dashboard/delete-row-button"
import { TablePagination } from "@/components/dashboard/table-pagination"
import { CollectionArea, CollectionSummary, WorkspaceHeader } from "@/components/dashboard/page-layout"
import { CollectionToolbar } from "@/components/dashboard/collection-toolbar"
import { useCollectionView } from "@/hooks/use-collection-view"
import { usePagination } from "@/hooks/use-pagination"
import {
  useDeleteLocationEmployee,
  useMyLocationEmployees,
} from "@/lib/api/hooks/use-location-employees"
import { useLocations } from "@/lib/api/hooks/use-locations"
import { ApiError } from "@/lib/api/client"
import type { LocationEmployeeWithLocation } from "@/lib/api/types"
import { EmployeeDialog } from "./employee-dialog"

/**
 * The on-site staff roster across every one of the kiosk's locations, in the kiosk-owner
 * sidebar as its own page rather than buried inside each location's own detail page -- an
 * owner managing several sites needs to see and add staff without opening one location at a
 * time to do it.
 */
export default function EmployeesPage() {
  const { data: employees, isLoading, isError, refetch } = useMyLocationEmployees()
  const { data: locations } = useLocations()
  const deleteEmployee = useDeleteLocationEmployee()
  const [dialogState, setDialogState] = React.useState<
    { mode: "add" } | { mode: "edit"; employee: LocationEmployeeWithLocation } | null
  >(null)

  const view = useCollectionView(employees, {
    searchText: (item) => [item.name, item.title, item.phone, item.email, item.location.name].join(" "),
    sorts: [
      { label: "Name: A to Z", value: "name", compare: (a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }) },
      { label: "Location", value: "location", compare: (a, b) => a.location.name.localeCompare(b.location.name, undefined, { numeric: true }) },
    ],
    filters: (locations ?? []).length > 1
      ? [
          {
            key: "location",
            label: "Location",
            options: (locations ?? []).map((location) => ({
              label: location.name,
              value: location.id,
              matches: (item: LocationEmployeeWithLocation) => item.locationId === location.id,
            })),
          },
        ]
      : [],
  })
  const { page, setPage, pageCount, pageItems, totalItems, pageSize } = usePagination(view.items, undefined, view.resetKey)

  function handleDelete(employee: LocationEmployeeWithLocation) {
    deleteEmployee.mutate(
      { locationId: employee.locationId, id: employee.id },
      {
        onSuccess: () => toast.success(`${employee.name} was removed.`),
        onError: (error) =>
          toast.error(error instanceof ApiError ? error.message : "Could not remove that employee."),
      },
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <WorkspaceHeader
        title="Employees"
        actions={
          <Button
            type="button"
            className="gap-1.5"
            onClick={() => setDialogState({ mode: "add" })}
            disabled={!locations || locations.length === 0}
          >
            <UserPlusIcon className="size-4" />
            Add employee
          </Button>
        }
      />

      <CollectionSummary
        isLoading={isLoading}
        isError={isError}
        items={[
          { label: "Employees", value: employees?.length ?? 0, detail: "On file across every location" },
          {
            label: "Locations covered",
            value: new Set((employees ?? []).map((e) => e.locationId)).size,
            detail: "Have at least one employee",
          },
        ]}
      />

      <CollectionToolbar view={view} label="Employees" />

      {isError && <InlineQueryError message="Could not load employees." onRetry={refetch} />}

      <CollectionArea title="Employee roster" titleHidden count={totalItems}>
        <div className="flex flex-col gap-2">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Location</TableHead>
                <TableHead>Title</TableHead>
                <TableHead>Contact</TableHead>
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
                <TableEmptyRow colSpan={5} hasFilters={view.hasFilters}>
                  {locations && locations.length === 0
                    ? "Add a location first, then come back here to add its staff."
                    : "No employees on file yet."}
                </TableEmptyRow>
              )}

              {pageItems.map((employee, index) => (
                <TableRow key={employee.id} index={index}>
                  <TableCell className="font-medium">{employee.name}</TableCell>
                  <TableCell>{employee.location.name}</TableCell>
                  <TableCell>{employee.title ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {[employee.phone, employee.email].filter(Boolean).join(" · ") || "—"}
                  </TableCell>
                  <TableCell>
                    <TableRowActions>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        className="text-muted-foreground hover:text-foreground"
                        onClick={() => setDialogState({ mode: "edit", employee })}
                        aria-label={`Edit ${employee.name}`}
                      >
                        <PencilIcon className="size-3.5" />
                      </Button>
                      <DeleteRowButton
                        itemLabel={employee.name}
                        onConfirm={() => handleDelete(employee)}
                        isPending={deleteEmployee.isPending}
                        ariaLabel={`Remove ${employee.name}`}
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
      </CollectionArea>

      <EmployeeDialog
        locations={locations ?? []}
        employee={dialogState?.mode === "edit" ? dialogState.employee : undefined}
        open={dialogState !== null}
        onOpenChange={(open) => setDialogState(open ? (dialogState ?? { mode: "add" }) : null)}
      />
    </div>
  )
}
