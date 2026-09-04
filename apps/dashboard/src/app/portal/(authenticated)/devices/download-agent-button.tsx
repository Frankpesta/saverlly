"use client"

import { DownloadIcon } from "lucide-react"
import { Button, buttonVariants } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { formatBytes, useAgentRelease } from "@/lib/api/hooks/use-agent-release"
import { cn } from "@/lib/utils"

/**
 * Downloads the Windows agent installer.
 *
 * This used to be an `<a href={process.env.NEXT_PUBLIC_AGENT_DOWNLOAD_URL}>` with a toast
 * fallback reading "Agent download isn't available yet". The variable was never set, so the
 * button did nothing at all, and because `NEXT_PUBLIC_*` is baked in at build time, setting it
 * meant redeploying the frontend. It now hits a real backend endpoint that either streams the
 * installer or redirects to object storage, and says which version and how large before you
 * click.
 */
export function DownloadAgentButton() {
  const { data: release, isLoading } = useAgentRelease()

  if (isLoading) {
    return <Skeleton className="h-9 w-40" />
  }

  if (!release?.available) {
    return (
      <div className="flex flex-col items-end gap-1">
        <Button type="button" variant="outline" className="gap-1.5" disabled>
          <DownloadIcon className="size-4" />
          Download Agent
        </Button>
        <p className="text-meta text-muted-foreground">
          No installer has been published for this deployment yet.
        </p>
      </div>
    )
  }

  const detail = [
    `v${release.version}`,
    release.sizeBytes ? formatBytes(release.sizeBytes) : null,
  ]
    .filter(Boolean)
    .join(" · ")

  return (
    <div className="flex flex-col items-end gap-1">
      {/* A plain anchor, not a router link: the response is a file, and letting the browser take
          it means the download works without any client-side handling. When the installer lives
          in object storage the link goes straight there, rather than pulling 32MB through the
          proxy only to hand it on. */}
      <a
        href={release.remoteUrl ?? "/api/proxy/releases/agent/latest"}
        className={cn(buttonVariants({ variant: "outline" }), "gap-1.5")}
      >
        <DownloadIcon className="size-4" />
        Download Agent
      </a>
      <p className="text-meta text-muted-foreground">
        Windows installer, {detail}. Run it and enter the location&apos;s setup code.
      </p>
    </div>
  )
}
