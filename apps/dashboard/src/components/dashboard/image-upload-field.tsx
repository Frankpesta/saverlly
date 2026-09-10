"use client"

import * as React from "react"
import { ImagePlusIcon, Loader2Icon, LinkIcon, RefreshCwIcon, TriangleAlertIcon, XIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import { proxiedImageUrl } from "@/lib/image-proxy"

const ACCEPTED_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"]

/** Retry delay for a preview that fails to load. Long enough to clear a real race (the backend
 *  hadn't finished writing the just-uploaded file when the proxy first fetched it), short enough
 *  that a genuinely broken URL still reaches its failed state quickly. */
const RETRY_DELAY_MS = 600

/**
 * The thumbnail for a set image URL.
 *
 * Keyed by `value` from the parent, so switching to a different image starts this component
 * fresh rather than carrying over a previous failure/retry state.
 *
 * Previously this was a plain `<img>` with `onError={(e) => e.currentTarget.style.display =
 * "none"}` — an imperative DOM mutation with nothing to ever undo it. A transient failure (the
 * image-proxy route 502ing because the backend hadn't finished writing the just-uploaded file
 * yet) hid the preview permanently, even though the exact same URL would have loaded fine a
 * moment later — which read as "the preview shows it, then it doesn't". Tracking the failure in
 * React state instead lets one retry actually recover, and only shows a real failed state once
 * that retry has also failed.
 */
function ImagePreviewThumbnail({ src, alt }: { src: string; alt: string }) {
  const [attempt, setAttempt] = React.useState(0)
  const [failed, setFailed] = React.useState(false)

  function handleError() {
    if (attempt === 0) {
      window.setTimeout(() => setAttempt(1), RETRY_DELAY_MS)
    } else {
      setFailed(true)
    }
  }

  if (failed) {
    return (
      <div className="flex h-40 w-full flex-col items-center justify-center gap-1.5 bg-muted text-muted-foreground">
        <TriangleAlertIcon className="size-5" />
        <p className="text-xs">Couldn&apos;t load this image</p>
      </div>
    )
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element -- proxied, arbitrary-origin image
    <img
      // A cache-busting suffix on the retry, not a plain re-render: re-setting an <img> to the
      // exact same src string doesn't reliably trigger the browser to refetch it.
      src={attempt === 0 ? src : `${src}&retry=1`}
      alt={alt}
      className="h-40 w-full object-cover"
      onError={handleError}
    />
  )
}

/** A drag-and-drop image uploader with a real thumbnail preview once something's set, instead
 * of a bare URL text field next to an "Upload" button. Falls back to a manual URL paste for
 * cases where the image already lives somewhere else (behind a small toggle, so the primary
 * path stays upload-first). */
export function ImageUploadField({
  id,
  value,
  onChange,
  onUploadFile,
  isUploading,
}: {
  id?: string
  value: string
  onChange: (url: string) => void
  onUploadFile: (file: File) => void
  isUploading: boolean
}) {
  const [isDragging, setIsDragging] = React.useState(false)
  const [showUrlInput, setShowUrlInput] = React.useState(false)
  const fileInputRef = React.useRef<HTMLInputElement>(null)

  function openFilePicker() {
    fileInputRef.current?.click()
  }

  function handleFiles(files: FileList | null) {
    const file = files?.[0]
    if (!file) return
    if (!ACCEPTED_TYPES.includes(file.type)) return
    onUploadFile(file)
  }

  function handleDrop(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault()
    setIsDragging(false)
    handleFiles(event.dataTransfer.files)
  }

  if (value) {
    return (
      <div className="flex flex-col gap-2">
        <div className="relative overflow-hidden rounded-xl border border-black/8">
          <ImagePreviewThumbnail key={value} src={proxiedImageUrl(value)} alt="" />
          {isUploading && (
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
              disabled={isUploading}
              onClick={openFilePicker}
              aria-label="Replace image"
            >
              <RefreshCwIcon className="size-3.5" />
            </Button>
            <Button
              type="button"
              size="icon-sm"
              variant="secondary"
              className="text-destructive shadow-sm hover:text-destructive"
              disabled={isUploading}
              onClick={() => onChange("")}
              aria-label="Remove image"
            >
              <XIcon className="size-3.5" />
            </Button>
          </div>
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
    )
  }

  return (
    <div className="flex flex-col gap-2">
      <div
        role="button"
        tabIndex={0}
        onClick={openFilePicker}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && openFilePicker()}
        onDragOver={(e) => {
          e.preventDefault()
          setIsDragging(true)
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        className={cn(
          "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-6 py-8 text-center transition-colors",
          isDragging
            ? "border-[var(--brand-teal)] bg-[var(--brand-teal-tint)]/40"
            : "border-black/12 hover:border-black/20 hover:bg-muted/40",
        )}
      >
        {isUploading ? (
          <Loader2Icon className="size-6 animate-spin text-muted-foreground" />
        ) : (
          <ImagePlusIcon className="size-6 text-muted-foreground" />
        )}
        <div>
          <p className="text-sm font-medium">
            {isUploading ? "Uploading…" : "Drag and drop an image, or click to browse"}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">PNG, JPEG, WebP or GIF, up to 5MB</p>
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
  )
}
