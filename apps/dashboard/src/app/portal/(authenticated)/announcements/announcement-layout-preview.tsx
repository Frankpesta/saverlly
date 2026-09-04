"use client"

import * as React from "react"
import {
  ANNOUNCEMENT_AUTO_DISMISS_MS,
  isFullBleedLayout,
  renderAnnouncementLayoutHtml,
  type AnnouncementLayout,
} from "@saverlly/shared-types"
import { absoluteProxiedImageUrl } from "@/lib/image-proxy"

/**
 * The kiosk preview. Not a lookalike built from the same data, but the *actual* document the
 * kiosk agent writes to disk and loads into its WebView2 overlay, dropped into an iframe.
 * Anything that renders wrong here renders wrong on the kiosk, which is the point.
 *
 * `sandbox="allow-scripts"` without `allow-same-origin` gives the frame an opaque origin: the
 * scaling script in the document can run (without it the fixed-size stage would just be clipped),
 * but it can't reach back into the dashboard.
 *
 * The frame is the toast card itself at its authored size, because that is exactly what the kiosk
 * shows, a card in the bottom-right corner of the screen, not a full-screen takeover. What it
 * can't show is the two behaviours that only exist with a host attached: the slide-in and the
 * auto-dismiss, both of which the document skips in non-interactive mode so the preview holds
 * still.
 */
export function AnnouncementLayoutPreview({
  layout,
  label = "Kiosk preview",
}: {
  layout: AnnouncementLayout
  label?: string
}) {
  // Same mixed-content rewrite the canvas does: the kiosk fetches upload URLs directly over
  // HTTP, but this document runs inside the HTTPS dashboard, where the browser would drop them
  // silently. The kiosk agent renders the identical function without a resolver, so it still
  // gets the URLs exactly as saved.
  const html = React.useMemo(
    () =>
      renderAnnouncementLayoutHtml(layout, {
        interactive: false,
        resolveImageUrl: absoluteProxiedImageUrl,
      }),
    [layout],
  )

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-center gap-1.5">
        <span className="relative flex size-1.5">
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-[var(--brand-teal)] opacity-60" />
          <span className="relative inline-flex size-1.5 rounded-full bg-[var(--brand-teal)]" />
        </span>
        <p className="text-xs font-semibold tracking-[0.08em] text-muted-foreground uppercase">
          {label}
        </p>
      </div>

      {/* Shaped from the layout, not from the old portrait constants, so switching the canvas to
          landscape or full screen shows a landscape or full-screen preview rather than the same
          tall card with the design squeezed into it. */}
      <div
        className="mx-auto w-full overflow-hidden rounded-xl border border-black/10 bg-black/80 dark:border-white/10"
        style={{
          aspectRatio: `${layout.width} / ${layout.height}`,
          maxWidth: layout.width,
        }}
      >
        <iframe
          title={label}
          srcDoc={html}
          sandbox="allow-scripts"
          className="size-full border-0"
        />
      </div>

      <p className="text-xs text-muted-foreground">
        This is the real overlay document, rendered exactly as the kiosk will show it,{" "}
        {isFullBleedLayout(layout)
          ? "covering the whole kiosk display"
          : "as a card in the bottom-right corner of the screen"}
        , which slides in and closes itself after{" "}
        {Math.round(ANNOUNCEMENT_AUTO_DISMISS_MS / 1000)} seconds.
      </p>
    </div>
  )
}
