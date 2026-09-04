"use client"

import * as React from "react"
import { toast } from "sonner"
import { CameraIcon, Loader2Icon, Trash2Icon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useRemoveAvatar, useUploadAvatar } from "@/lib/api/hooks/use-current-user"
import { ApiError } from "@/lib/api/client"
import { proxiedImageUrl } from "@/lib/image-proxy"
import { cn } from "@/lib/utils"

const ACCEPTED_TYPES = ["image/png", "image/jpeg", "image/webp"]
const MAX_BYTES = 2 * 1024 * 1024

export function profileInitials(name: string | null, email: string): string {
  const source = name?.trim()
  if (source) {
    const parts = source.split(/\s+/)
    return (
      parts.length > 1 ? `${parts[0][0]}${parts[parts.length - 1][0]}` : parts[0].slice(0, 2)
    ).toUpperCase()
  }
  return email.slice(0, 2).toUpperCase()
}

/**
 * The profile photo: a large circular avatar you upload to by clicking it or dropping a file on
 * it. Deliberately not the shared `ImageUploadField`, which is a rectangular drop zone with a
 * 16:9 preview built for announcement and promotion creatives. A face crops to a circle, and the
 * thing you click should look like the thing you are changing.
 *
 * This renders the circle and nothing else, so the page can place it (overlapping a header band,
 * inline in a row) without a wrapper having to reach around a stacked caption. `RemoveAvatarButton`
 * is the companion action.
 *
 * The size limit and accepted types mirror `users.controller.ts`, so an oversized file is
 * rejected here with a useful message instead of coming back as a bare 413.
 */
export function AvatarUpload({
  name,
  email,
  avatarUrl,
  className,
}: {
  name: string | null
  email: string
  avatarUrl: string | null
  className?: string
}) {
  const uploadAvatar = useUploadAvatar()
  const inputRef = React.useRef<HTMLInputElement>(null)
  const [isDragging, setIsDragging] = React.useState(false)
  // A plain <img> rather than Radix's Avatar: this one is interactive (click, drop, hover
  // overlay), and it needs its own onError so a dead URL falls back to initials instead of
  // leaving a broken-image glyph inside the circle.
  const [failed, setFailed] = React.useState(false)

  const isBusy = uploadAvatar.isPending

  function handleFile(file: File | undefined) {
    if (!file) return
    if (!ACCEPTED_TYPES.includes(file.type)) {
      toast.error("Choose a PNG, JPEG, or WebP image.")
      return
    }
    if (file.size > MAX_BYTES) {
      toast.error("That image is over 2MB. Pick a smaller one.")
      return
    }
    setFailed(false)
    uploadAvatar.mutate(file, {
      onSuccess: () => toast.success("Profile photo updated."),
      onError: (error) =>
        toast.error(error instanceof ApiError ? error.message : "Could not upload that photo."),
    })
  }

  const showImage = !!avatarUrl && !failed

  return (
    <>
      <div
        role="button"
        tabIndex={0}
        aria-label={avatarUrl ? "Change profile photo" : "Upload a profile photo"}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault()
            inputRef.current?.click()
          }
        }}
        onDragOver={(e) => {
          e.preventDefault()
          setIsDragging(true)
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(e) => {
          e.preventDefault()
          setIsDragging(false)
          handleFile(e.dataTransfer.files?.[0])
        }}
        className={cn(
          "group relative size-28 shrink-0 overflow-hidden rounded-full outline-none transition-shadow",
          "ring-1 ring-black/8 dark:ring-white/12",
          "focus-visible:ring-2 focus-visible:ring-[var(--brand-teal)] focus-visible:ring-offset-2 focus-visible:ring-offset-background",
          isDragging && "ring-2 ring-[var(--brand-teal)]",
          className,
        )}
      >
        {showImage ? (
          // eslint-disable-next-line @next/next/no-img-element -- proxied, arbitrary-origin image
          <img
            src={proxiedImageUrl(avatarUrl)}
            alt={name ?? email}
            className="size-full object-cover"
            onError={() => setFailed(true)}
          />
        ) : (
          <span className="flex size-full items-center justify-center bg-[var(--brand-teal-tint)] text-2xl font-semibold tracking-tight text-[var(--brand-teal)]">
            {profileInitials(name, email)}
          </span>
        )}

        {/* The change affordance stays hidden until hover/focus so the photo is the photo at
            rest, rather than permanently wearing a button over someone's face. */}
        <span
          className={cn(
            "absolute inset-0 flex flex-col items-center justify-center gap-1 bg-black/55 text-white opacity-0 transition-opacity",
            "group-hover:opacity-100 group-focus-visible:opacity-100",
            isBusy && "opacity-100",
          )}
        >
          {isBusy ? (
            <Loader2Icon className="size-6 animate-spin" />
          ) : (
            <>
              <CameraIcon className="size-5" />
              <span className="text-meta font-medium">
                {avatarUrl ? "Change" : "Upload"}
              </span>
            </>
          )}
        </span>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED_TYPES.join(",")}
        className="hidden"
        onChange={(e) => {
          handleFile(e.target.files?.[0])
          // Reset so re-picking the same file after a failed upload still fires onChange.
          e.target.value = ""
        }}
      />

    </>
  )
}

/** The companion action to `AvatarUpload`. Separate so the page can put it where it belongs in
 * the layout instead of always directly beneath the circle. */
export function RemoveAvatarButton() {
  const removeAvatar = useRemoveAvatar()

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="gap-1.5 text-red-500 hover:text-destructive"
      disabled={removeAvatar.isPending}
      onClick={() =>
        removeAvatar.mutate(undefined, {
          onSuccess: () => toast.success("Profile photo removed."),
          onError: (error) =>
            toast.error(
              error instanceof ApiError ? error.message : "Could not remove that photo.",
            ),
        })
      }
    >
      <Trash2Icon className="size-3.5 text-red-500" />
      {removeAvatar.isPending ? "Removing…" : "Remove photo"}
    </Button>
  )
}
