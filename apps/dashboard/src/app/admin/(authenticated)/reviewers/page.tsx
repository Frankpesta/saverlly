"use client"
import * as React from "react"
import Link from "next/link"
import { PlusIcon, BanIcon } from "lucide-react"
import { toast } from "sonner"
import { WorkspaceHeader, CollectionSummary } from "@/components/dashboard/page-layout"
import { CollectionToolbar } from "@/components/dashboard/collection-toolbar"
import { InlineQueryError } from "@/components/dashboard/query-state"
import { TablePagination } from "@/components/dashboard/table-pagination"
import { useCollectionView } from "@/hooks/use-collection-view"
import { usePagination } from "@/hooks/use-pagination"
import { Button, buttonVariants } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Table,
  TableHeader,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  TableEmptyRow,
  TableRowActions,
} from "@/components/ui/table"
import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog"
import {
  useReviewers,
  useReviewerAccess,
  useRevokeReviewer,
  reviewerStatus,
  type Reviewer,
} from "@/lib/api/hooks/use-reviewers"
import { ApiError } from "@/lib/api/client"
import { relativeTime } from "@/lib/relative-time"

function showError(error: unknown) {
  toast.error(error instanceof ApiError ? error.message : "Could not update reviewer access.")
}
export default function ReviewersPage() {
  const { data, isLoading, isError, refetch } = useReviewers()
  const access = useReviewerAccess()
  const view = useCollectionView(data?.reviewers, {
    searchText: (r) => [r.name, r.email, r.codeHint].join(" "),
    sorts: [
      {
        label: "Newest first",
        value: "newest",
        compare: (a, b) => b.createdAt.localeCompare(a.createdAt),
      },
      { label: "Name: A to Z", value: "name", compare: (a, b) => a.name.localeCompare(b.name) },
    ],
    filters: [
      {
        key: "status",
        label: "Status",
        options: ["Invited", "Active", "Paused", "Expired", "Revoked"].map((status) => ({
          label: status,
          value: status,
          matches: (r: Reviewer) => reviewerStatus(r, data?.enabled ?? false) === status,
        })),
      },
    ],
  })
  const pagination = usePagination(view.items, undefined, view.resetKey)
  const list = data?.reviewers ?? []
  return (
    <div className="flex flex-col gap-6">
      <WorkspaceHeader
        title="Reviewers"
        description="Invite people to try the extension without installing the desktop agent."
        actions={
          <Link href="/admin/reviewers/new" className={buttonVariants()}>
            <PlusIcon className="size-4" />
            New reviewer
          </Link>
        }
      />
      <CollectionSummary
        isLoading={isLoading}
        isError={isError}
        items={[
          { label: "Reviewers", value: list.length },
          { label: "Activated", value: list.filter((r) => r.sessions.length > 0).length },
          { label: "Installations", value: list.reduce((sum, r) => sum + r.sessions.length, 0) },
        ]}
      />
      <div className="flex items-center justify-between gap-4 rounded-lg border border-border p-4">
        <div>
          <Label htmlFor="reviewer-access">Reviewer access</Label>
          <p className="mt-1 text-sm text-muted-foreground">
            Turning this off pauses all reviewer codes and sessions.
          </p>
        </div>
        <Switch
          id="reviewer-access"
          checked={data?.enabled ?? false}
          disabled={isLoading || isError || access.isPending}
          onCheckedChange={(enabled) =>
            access.mutate(enabled, {
              onSuccess: () =>
                toast.success(enabled ? "Reviewer access enabled." : "Reviewer access paused."),
              onError: showError,
            })
          }
        />
      </div>
      <CollectionToolbar view={view} label="Reviewers" />
      {isError && <InlineQueryError message="Could not load reviewers." onRetry={refetch} />}
      <div className="flex flex-col gap-2">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Reviewer</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Installations</TableHead>
              <TableHead>Expires</TableHead>
              <TableHead>Last active</TableHead>
              <TableHead className="w-16">
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading &&
              Array.from({ length: 4 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell colSpan={6}>
                    <Skeleton className="h-6 w-full" />
                  </TableCell>
                </TableRow>
              ))}
            {!isLoading && !isError && !view.items.length && (
              <TableEmptyRow colSpan={6} hasFilters={view.hasFilters}>
                No reviewers yet.
              </TableEmptyRow>
            )}
            {pagination.pageItems.map((reviewer, index) => (
              <ReviewerRow
                key={reviewer.id}
                reviewer={reviewer}
                enabled={data?.enabled ?? false}
                index={index}
              />
            ))}
          </TableBody>
        </Table>
        <TablePagination {...pagination} onPageChange={pagination.setPage} />
      </div>
    </div>
  )
}
function ReviewerRow({
  reviewer,
  enabled,
  index,
}: {
  reviewer: Reviewer
  enabled: boolean
  index: number
}) {
  const revoke = useRevokeReviewer()
  const status = reviewerStatus(reviewer, enabled)
  const lastSeen = reviewer.sessions
    .map((s) => s.lastSeenAt)
    .filter((s): s is string => !!s)
    .sort()
    .at(-1)
  return (
    <TableRow index={index}>
      <TableCell>
        <div className="font-medium">{reviewer.name}</div>
        {reviewer.email && <div className="text-xs text-muted-foreground">{reviewer.email}</div>}
        <div className="text-xs text-muted-foreground">Code ending {reviewer.codeHint}</div>
      </TableCell>
      <TableCell>
        <Badge variant={status === "Active" ? "default" : "secondary"}>{status}</Badge>
      </TableCell>
      <TableCell className="tabular-nums">
        {reviewer.sessions.length} / {reviewer.maxInstallations}
      </TableCell>
      <TableCell title={new Date(reviewer.expiresAt).toLocaleString()}>
        {new Date(reviewer.expiresAt).toLocaleDateString()}
      </TableCell>
      <TableCell>{lastSeen ? relativeTime(lastSeen) : "Never"}</TableCell>
      <TableCell>
        <TableRowActions>
          {!reviewer.revokedAt && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="ghost" size="icon-sm" aria-label={`Revoke ${reviewer.name}`}>
                  <BanIcon className="size-3.5 text-destructive" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Revoke {reviewer.name}?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Their code and every installation using it will stop working. This cannot be
                    undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    disabled={revoke.isPending}
                    onClick={() =>
                      revoke.mutate(reviewer.id, {
                        onSuccess: () => toast.success("Reviewer access revoked."),
                        onError: showError,
                      })
                    }
                  >
                    Revoke access
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </TableRowActions>
      </TableCell>
    </TableRow>
  )
}
