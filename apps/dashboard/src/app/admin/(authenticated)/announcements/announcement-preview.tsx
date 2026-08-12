export function AnnouncementPreview({
  title,
  body,
  mediaUrl,
}: {
  title: string
  body: string
  mediaUrl?: string
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="mx-auto flex w-full max-w-xs flex-col overflow-hidden rounded-2xl border border-black/10 bg-white shadow-[0_8px_24px_rgba(11,11,11,0.12)]">
        {mediaUrl && (
          // eslint-disable-next-line @next/next/no-img-element -- mediaUrl is an arbitrary external URL; next/image would need per-origin allowlisting in next.config
          <img
            src={mediaUrl}
            alt=""
            className="h-32 w-full object-cover"
            onError={(e) => {
              e.currentTarget.style.display = "none"
            }}
          />
        )}
        <div className="flex flex-col gap-1.5 p-4">
          <p className="text-base font-semibold">{title || "Announcement title"}</p>
          <p className="whitespace-pre-wrap text-sm text-muted-foreground">
            {body || "Announcement body text goes here."}
          </p>
        </div>
      </div>
      <p className="text-center text-xs text-muted-foreground">
        Approximate preview — the kiosk overlay today renders title and body only; image display
        isn&apos;t wired into the desktop agent yet.
      </p>
    </div>
  )
}
