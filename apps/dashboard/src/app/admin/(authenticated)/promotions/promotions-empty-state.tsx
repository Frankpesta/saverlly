"use client"

import Link from "next/link"
import { MegaphoneIcon } from "lucide-react"
import { buttonVariants } from "@/components/ui/button"
import { cn } from "@/lib/utils"

/** Matches `EntityCreatedPanel`'s shell (icon chip, title, description, single CTA) rather than
 * a bespoke hero — a rotated device mockup and an icon-bulleted feature list were the one empty
 * state in the app that didn't look like the rest of it. */
export function PromotionsEmptyState() {
  return (
    <div className="flex flex-col items-center gap-4 rounded-2xl border border-black/8 bg-card px-6 py-16 text-center shadow-xs dark:border-white/10">
      <span className="flex size-12 items-center justify-center rounded-full bg-[var(--brand-teal-tint)] text-[var(--brand-teal)]">
        <MegaphoneIcon className="size-5" />
      </span>
      <div className="flex flex-col gap-1.5">
        <h3 className="text-title">No promotions yet</h3>
        <p className="max-w-sm text-sm text-muted-foreground">
          A promotion is a sponsored creative shown inside the Saverlly extension while a shopper
          is browsing a store.
        </p>
      </div>
      <Link href="/admin/promotions/new" className={cn(buttonVariants(), "mt-1")}>
        Create your first promotion
      </Link>
    </div>
  )
}
