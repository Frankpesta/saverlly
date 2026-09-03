"use client"

import * as React from "react"
import Link from "next/link"
import { toast } from "sonner"
import { PencilIcon, PauseIcon, PlayIcon, ExternalLinkIcon } from "lucide-react"
import { Button, buttonVariants } from "@/components/ui/button"
import { DeleteRowButton } from "@/components/dashboard/delete-row-button"
import { useDeletePromotion, useUpdatePromotion } from "@/lib/api/hooks/use-promotions"
import { ApiError } from "@/lib/api/client"
import { proxiedImageUrl } from "@/lib/image-proxy"
import { cn } from "@/lib/utils"
import type { Promotion } from "@/lib/api/types"
import {
  formatDateRange,
  promotionStatus,
  targetingSummary,
  type PromotionStatus,
} from "./promotion-status"


const STATUS_STYLE: Record<PromotionStatus, { dot: string; text: string }> = {
  Live: {
    dot: "bg-emerald-500 shadow-[0_0_0_3px_rgba(16,185,129,0.18)]",
    text: "text-emerald-700 dark:text-emerald-400",
  },
  Scheduled: { dot: "bg-sky-500", text: "text-sky-700 dark:text-sky-400" },
  Ended: { dot: "bg-neutral-300 dark:bg-neutral-600", text: "text-muted-foreground" },
  Paused: { dot: "bg-amber-500", text: "text-amber-700 dark:text-amber-400" },
}

export function PromotionCard({ promotion, now }: { promotion: Promotion; now: number }) {
  const status = promotionStatus(promotion, now)
  const style = STATUS_STYLE[status]
  const updatePromotion = useUpdatePromotion(promotion.id)
  const deletePromotion = useDeletePromotion()

  function togglePaused() {
    const nextActive = !promotion.active
    updatePromotion.mutate(
      { active: nextActive },
      {
        onSuccess: () =>
          toast.success(`${promotion.name} was ${nextActive ? "resumed" : "paused"}.`),
        onError: (error) =>
          toast.error(error instanceof ApiError ? error.message : "Could not update promotion."),
      },
    )
  }

  function handleDelete() {
    deletePromotion.mutate(promotion.id, {
      onSuccess: () => toast.success(`${promotion.name} was deleted.`),
      onError: (error) =>
        toast.error(error instanceof ApiError ? error.message : "Could not delete promotion."),
    })
  }

  return (
    <div
      className={cn(
        "group relative flex flex-col overflow-hidden rounded-2xl border border-black/8 bg-card transition-all duration-200 dark:border-white/10",
        "hover:-translate-y-0.5 hover:border-black/12 hover:shadow-[0_8px_24px_-12px_rgba(0,0,0,0.18)] dark:hover:border-white/20",
        // An ended or paused promotion is visibly inert. Desaturated until hovered, so the
        // gallery reads at a glance without having to parse any text.
        status === "Ended" || status === "Paused" ? "opacity-70 hover:opacity-100" : "",
      )}
    >
      {/* The creative bleeds edge to edge because it is the point of the card, not an illustration in it. */}
      <Link
        href={`/admin/promotions/${promotion.id}`}
        className="relative block bg-muted"
        aria-label={`Edit ${promotion.name}`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- proxied, arbitrary-origin image */}
        <img
          src={proxiedImageUrl(promotion.imageSmallUrl)}
          alt=""
          className="block w-full object-cover"
          style={{ aspectRatio: "320 / 100" }}
          onError={(e) => {
            e.currentTarget.style.visibility = "hidden"
          }}
        />
        {/* bg-card/90, not a literal white, because the pill sits over arbitrary artwork in both themes. */}
        <span className="absolute top-3 left-3 inline-flex items-center gap-1.5 rounded-full bg-card/90 px-2.5 py-1 text-[11px] font-medium shadow-sm backdrop-blur-sm">
          <span className={cn("size-1.5 rounded-full", style.dot)} />
          <span className={style.text}>{status}</span>
        </span>
      </Link>

      <div className="flex flex-1 flex-col gap-1 p-4">
        <div className="flex items-start justify-between gap-2">
          <Link
            href={`/admin/promotions/${promotion.id}`}
            className="text-sm font-semibold tracking-tight hover:underline"
          >
            {promotion.name}
          </Link>
          <a
            href={promotion.clickUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-0.5 shrink-0 text-muted-foreground transition-colors hover:text-foreground"
            aria-label={`Open the click-through URL for ${promotion.name}`}
          >
            <ExternalLinkIcon className="size-3.5" />
          </a>
        </div>

        <p className="truncate text-xs text-muted-foreground" title={targetingSummary(promotion)}>
          {targetingSummary(promotion)}
        </p>
        <p className="text-xs text-muted-foreground/80">
          {formatDateRange(promotion.startAt, promotion.endAt, now)}
        </p>

        {/* Actions stay out of the way until the card is hovered or something inside it is
            focused, so the gallery reads as artwork rather than as a toolbar grid. */}
        <div className="mt-3 flex items-center gap-1 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
          <Link
            href={`/admin/promotions/${promotion.id}`}
            className={cn(
              buttonVariants({ variant: "ghost", size: "icon-sm" }),
              "text-muted-foreground hover:text-foreground",
            )}
            aria-label={`Edit ${promotion.name}`}
          >
            <PencilIcon className="size-3.5" />
          </Link>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="text-muted-foreground hover:text-foreground"
            onClick={togglePaused}
            disabled={updatePromotion.isPending}
            aria-label={promotion.active ? `Pause ${promotion.name}` : `Resume ${promotion.name}`}
          >
            {promotion.active ? (
              <PauseIcon className="size-3.5" />
            ) : (
              <PlayIcon className="size-3.5" />
            )}
          </Button>
          <DeleteRowButton
            itemLabel={promotion.name}
            description="This removes the promotion immediately. Devices stop showing it on their next popup open."
            onConfirm={handleDelete}
            isPending={deletePromotion.isPending}
            ariaLabel={`Delete ${promotion.name}`}
          />
        </div>
      </div>
    </div>
  )
}
