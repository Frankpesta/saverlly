"use client"

import Link from "next/link"
import { ArrowRightIcon, ImageIcon, MapPinIcon, CalendarClockIcon } from "lucide-react"
import { buttonVariants } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { PromotionPreview } from "./promotion-preview"

export function PromotionsEmptyState() {
  return (
    <div className="overflow-hidden rounded-2xl border border-black/8 bg-linear-to-b from-muted/40 to-transparent dark:border-white/10">
      <div className="grid grid-cols-1 items-center gap-10 px-6 py-12 md:grid-cols-[auto_minmax(0,1fr)] md:px-12">
        {/* Tilted and shadowed so it reads as an artefact being shown, not a live control. */}
        <div className="mx-auto w-fit md:mx-0">
          <div className="-rotate-3 rounded-[10px] shadow-[0_18px_40px_-16px_rgba(17,27,24,0.28)] transition-transform duration-300 hover:rotate-0">
            <PromotionPreview showLabel={false} emphasizeSlot />
          </div>
        </div>

        <div className="flex flex-col items-start gap-5">
          <div>
            <h3 className="text-xl font-semibold tracking-tight">No promotions yet</h3>
            <p className="mt-1.5 max-w-md text-sm text-muted-foreground">
              A promotion is a sponsored creative that appears inside the Saverlly extension
              while a shopper is browsing a store.
            </p>
          </div>

          <ul className="flex flex-col gap-2.5">
            <Requirement icon={<ImageIcon className="size-3.5" />}>
              Two creatives <strong className="font-medium text-foreground">320×100</strong> for
              the popup, <strong className="font-medium text-foreground">728×90</strong> in reserve
            </Requirement>
            <Requirement icon={<MapPinIcon className="size-3.5" />}>
              Target every device, or narrow it by location tag
            </Requirement>
            <Requirement icon={<CalendarClockIcon className="size-3.5" />}>
              Runs on a schedule you set, with a pause switch any time
            </Requirement>
          </ul>

          <Link href="/admin/promotions/new" className={cn(buttonVariants(), "mt-1 gap-1.5")}>
            Create your first promotion
            <ArrowRightIcon className="size-4" />
          </Link>
        </div>
      </div>
    </div>
  )
}

function Requirement({
  icon,
  children,
}: {
  icon: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <li className="flex items-center gap-2.5 text-sm text-muted-foreground">
      <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-card text-[var(--brand-teal)] ring-1 ring-black/6 dark:ring-white/10">
        {icon}
      </span>
      {children}
    </li>
  )
}
