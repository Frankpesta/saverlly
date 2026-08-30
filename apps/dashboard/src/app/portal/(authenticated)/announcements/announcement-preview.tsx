"use client"

import * as React from "react"
import { ImageOffIcon } from "lucide-react"
import { proxiedImageUrl } from "@/lib/image-proxy"

export function AnnouncementPreview({
  title,
  body,
  mediaUrl,
}: {
  title: string
  body: string
  mediaUrl?: string
}) {
  const [imageFailed, setImageFailed] = React.useState(false)

  React.useEffect(() => {
    setImageFailed(false)
  }, [mediaUrl])

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-center gap-1.5">
        <span className="relative flex size-1.5">
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-[var(--brand-teal)] opacity-60" />
          <span className="relative inline-flex size-1.5 rounded-full bg-[var(--brand-teal)]" />
        </span>
        <p className="text-xs font-semibold tracking-[0.08em] text-muted-foreground uppercase">
          Live preview
        </p>
      </div>

      <div className="flex items-center justify-center rounded-2xl bg-[radial-gradient(circle_at_50%_0%,var(--brand-teal-tint),transparent_70%)] p-6 dark:bg-[radial-gradient(circle_at_50%_0%,rgba(88,195,183,0.12),transparent_70%)]">
        <div className="w-full max-w-[300px] overflow-hidden rounded-[1.25rem] border border-black/8 bg-white shadow-[0_20px_45px_-12px_rgba(11,11,11,0.25)]">
          {mediaUrl && !imageFailed && (
            // eslint-disable-next-line @next/next/no-img-element -- proxied, arbitrary-origin image
            <img
              src={proxiedImageUrl(mediaUrl)}
              alt=""
              className="h-32 w-full object-cover"
              onError={() => setImageFailed(true)}
            />
          )}
          {mediaUrl && imageFailed && (
            <div className="flex h-32 w-full flex-col items-center justify-center gap-1.5 bg-muted text-muted-foreground">
              <ImageOffIcon className="size-5" />
              <p className="text-xs">Image failed to load</p>
            </div>
          )}
          <div className="flex flex-col gap-1.5 p-4">
            <p className="text-base font-semibold text-[var(--brand-black)]">
              {title || "Announcement title"}
            </p>
            <p className="line-clamp-4 whitespace-pre-wrap text-sm text-black/60">
              {body || "Announcement body text goes here."}
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
