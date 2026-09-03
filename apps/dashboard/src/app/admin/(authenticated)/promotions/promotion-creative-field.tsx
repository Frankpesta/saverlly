"use client"

import * as React from "react"
import { toast } from "sonner"
import { ImagePlusIcon, Loader2Icon, LinkIcon, RefreshCwIcon, XIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { FormField } from "@/components/dashboard/form-section"
import {
  PROMOTION_CREATIVE_SIZES,
  useUploadPromotionImage,
  type PromotionCreativeSize,
} from "@/lib/api/hooks/use-promotions"
import { ApiError } from "@/lib/api/client"
import { proxiedImageUrl } from "@/lib/image-proxy"
import { cn } from "@/lib/utils"

const ACCEPTED_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"]

/**
 * A creative uploader for one of a promotion's two fixed slots. Unlike the generic
 * ImageUploadField, the drop zone previews at the slot's real aspect ratio, so a wrongly-shaped
 * image is obvious before the upload round-trip, and the backend's dimension rejection is
 * surfaced verbatim as a toast rather than a generic failure.
 */
export function PromotionCreativeField({
  size,
  id,
  value,
  onChange,
  error,
}: {
  size: PromotionCreativeSize
  id: string
  value: string
  onChange: (url: string) => void
  error?: string
}) {
  const spec = PROMOTION_CREATIVE_SIZES[size]
  const upload = useUploadPromotionImage(size)
  const [isDragging, setIsDragging] = React.useState(false)
  const [showUrlInput, setShowUrlInput] = React.useState(false)
  const fileInputRef = React.useRef<HTMLInputElement>(null)

  function handleFiles(files: FileList | null) {
    const file = files?.[0]
    if (!file) return
    if (!ACCEPTED_TYPES.includes(file.type)) {
      toast.error("Only PNG, JPEG, WebP or GIF images are accepted.")
      return
    }
    upload.mutate(file, {
      onSuccess: (data) => onChange(data.url),
      // The backend's message names the exact dimensions it wanted and what it got. Far more
      // useful to the admin than "upload failed", so it's passed straight through.
      onError: (err) =>
        toast.error(err instanceof ApiError ? err.message : "Could not upload the creative."),
    })
  }

  const label = `${spec.label} (${spec.width}×${spec.height})`

  return (
    <FormField
      label={label}
      htmlFor={id}
      hint={
        size === "small"
          ? "Shown in the extension popup today."
          : "Stored for the future on-page banner surface."
      }
      error={error}
    >
      {value ? (
        <div className="relative overflow-hidden rounded-xl border border-black/8 bg-muted/30 dark:border-white/10">
          {/* eslint-disable-next-line @next/next/no-img-element -- proxied, arbitrary-origin image */}
          <img
            src={proxiedImageUrl(value)}
            alt=""
            className="block w-full"
            style={{ aspectRatio: `${spec.width} / ${spec.height}`, objectFit: "contain" }}
            onError={(e) => {
              e.currentTarget.style.visibility = "hidden"
            }}
          />
          {upload.isPending && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/40">
              <Loader2Icon className="size-6 animate-spin text-white" />
            </div>
          )}
          <div className="absolute top-2 right-2 flex gap-1.5">
            <Button
              type="button"
              size="icon-sm"
              variant="secondary"
              className="shadow-sm"
              disabled={upload.isPending}
              onClick={() => fileInputRef.current?.click()}
              aria-label={`Replace ${spec.label}`}
            >
              <RefreshCwIcon className="size-3.5" />
            </Button>
            <Button
              type="button"
              size="icon-sm"
              variant="secondary"
              className="text-destructive shadow-sm hover:text-destructive"
              disabled={upload.isPending}
              onClick={() => onChange("")}
              aria-label={`Remove ${spec.label}`}
            >
              <XIcon className="size-3.5" />
            </Button>
          </div>
          <input
            ref={fileInputRef}
            id={id}
            type="file"
            accept={ACCEPTED_TYPES.join(",")}
            className="hidden"
            onChange={(e) => handleFiles(e.target.files)}
          />
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <div
            role="button"
            tabIndex={0}
            onClick={() => fileInputRef.current?.click()}
            onKeyDown={(e) =>
              (e.key === "Enter" || e.key === " ") && fileInputRef.current?.click()
            }
            onDragOver={(e) => {
              e.preventDefault()
              setIsDragging(true)
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={(e) => {
              e.preventDefault()
              setIsDragging(false)
              handleFiles(e.dataTransfer.files)
            }}
            style={{ aspectRatio: `${spec.width} / ${spec.height}` }}
            className={cn(
              "flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed text-center transition-colors",
              isDragging
                ? "border-[var(--brand-teal)] bg-[var(--brand-teal-tint)]/40"
                : "border-black/12 hover:border-black/20 hover:bg-muted/40 dark:border-white/15 dark:hover:border-white/25",
            )}
          >
            {upload.isPending ? (
              <Loader2Icon className="size-5 animate-spin text-muted-foreground" />
            ) : (
              <ImagePlusIcon className="size-5 text-muted-foreground" />
            )}
            <p className="text-sm font-medium">
              {upload.isPending ? "Uploading…" : `Drop a ${spec.width}×${spec.height} image`}
            </p>
            <p className="text-xs text-muted-foreground">
              or click to browse. Larger is fine at the same ratio
            </p>
            <input
              ref={fileInputRef}
              id={id}
              type="file"
              accept={ACCEPTED_TYPES.join(",")}
              className="hidden"
              onChange={(e) => handleFiles(e.target.files)}
            />
          </div>

          {showUrlInput ? (
            <Input
              type="url"
              autoFocus
              placeholder="https://…"
              value={value}
              onChange={(e) => onChange(e.target.value)}
              onBlur={() => {
                if (!value) setShowUrlInput(false)
              }}
            />
          ) : (
            <button
              type="button"
              onClick={() => setShowUrlInput(true)}
              className="flex w-fit items-center gap-1 text-xs text-muted-foreground hover:text-foreground hover:underline"
            >
              <LinkIcon className="size-3" />
              or paste an image URL instead
            </button>
          )}
        </div>
      )}
    </FormField>
  )
}
