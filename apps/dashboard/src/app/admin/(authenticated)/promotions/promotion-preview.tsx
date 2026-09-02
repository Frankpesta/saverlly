"use client"

import { ImageIcon } from "lucide-react"
import { proxiedImageUrl } from "@/lib/image-proxy"
import { cn } from "@/lib/utils"

/**
 * A scaled mock of the real Chrome extension popup, so an admin can see where a creative actually
 * lands rather than judging it as a bare rectangle. The 360px body width and the 16px gutters
 * mirror apps/extension/src/popup/popup.css — which is exactly why the small creative is 320px
 * wide, and why it renders here at its true 1:1 size.
 *
 * Everything inside the device frame is a literal colour, never a theme token: the extension popup
 * is light-only (popup.css pins `--bg: #ffffff` with no dark variant), so this mock must look
 * identical whichever theme the dashboard is in. Using `text-muted-foreground` in here would go
 * pale-on-white in dark mode and misrepresent what the shopper actually sees. Only the caption and
 * click-URL line *outside* the frame follow the dashboard theme.
 */
export function PromotionPreview({
  imageSmallUrl,
  clickUrl,
  showLabel = true,
  emphasizeSlot = false,
}: {
  imageSmallUrl?: string
  clickUrl?: string
  /** Hidden where surrounding copy already says what this is (e.g. the empty state). */
  showLabel?: boolean
  /** Rings the sponsored slot, to point at the one region a promotion actually fills. */
  emphasizeSlot?: boolean
}) {
  return (
    <div className="flex flex-col gap-2">
      {showLabel && (
        <p className="text-xs font-medium text-muted-foreground">Extension popup preview</p>
      )}
      <div className="w-[360px] max-w-full overflow-hidden rounded-[10px] border border-black/10 bg-white shadow-sm">
        <div className="flex items-center justify-between px-4 py-3.5">
          <span className="text-sm font-semibold tracking-tight text-[var(--brand-teal)]">
            Saverlly
          </span>
          <span className="text-lg leading-none text-black/60">&times;</span>
        </div>

        <div className="flex items-center justify-center gap-2 border-b border-black/10 px-4 py-2.5 text-[13px]">
          <span className="text-[#6b7280]">Lifetime Saved:</span>
          <span className="font-bold text-black">$128.40</span>
        </div>

        <div className="px-4 py-5 text-center">
          <p className="text-[15px] font-semibold text-black">
            Save up to <span className="text-[var(--brand-teal)]">20%</span> off
          </p>
          <div className="mt-3 rounded-md bg-[var(--brand-teal)] py-2 text-[13px] font-medium text-white">
            Apply Coupons
          </div>
        </div>

        <div
          className={cn(
            "border-t border-black/10 px-4 pt-3 pb-3.5",
            emphasizeSlot && "bg-[var(--brand-teal-tint)]/40",
          )}
        >
          <span className="mb-1.5 block text-[10px] tracking-[0.06em] text-[#6b7280] uppercase">
            Sponsored
          </span>
          {imageSmallUrl ? (
            /* eslint-disable-next-line @next/next/no-img-element -- proxied, arbitrary-origin image */
            <img
              src={proxiedImageUrl(imageSmallUrl)}
              alt=""
              className="block w-full rounded-lg"
              onError={(e) => {
                e.currentTarget.style.visibility = "hidden"
              }}
            />
          ) : (
            <div
              className={cn(
                "flex h-[100px] w-full items-center justify-center gap-2 rounded-lg border border-dashed text-xs",
                emphasizeSlot
                  ? "border-[var(--brand-teal)]/60 bg-white/60 font-medium text-[var(--brand-teal)]"
                  : "border-black/15 text-[#6b7280]",
              )}
            >
              <ImageIcon className="size-4" />
              320 &times; 100 creative
            </div>
          )}
        </div>
      </div>
      {clickUrl && (
        <p className="max-w-[360px] truncate text-xs text-muted-foreground">
          Clicks open <span className="font-medium text-foreground">{clickUrl}</span>
        </p>
      )}
    </div>
  )
}
