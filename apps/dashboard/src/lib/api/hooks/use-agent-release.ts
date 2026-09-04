"use client"

import { useQuery } from "@tanstack/react-query"
import { apiFetch } from "@/lib/api/client"

export type AgentRelease = {
  available: boolean
  version: string
  filename: string
  sizeBytes: number | null
  sha256: string | null
  builtAt: string | null
  remoteUrl: string | null
}

/** Describes the installer the Download Agent button is about to hand over. Read at runtime,
 * so the button reflects what the server actually has rather than a build-time env var. */
export function useAgentRelease() {
  return useQuery({
    queryKey: ["releases", "agent", "latest"],
    queryFn: () => apiFetch<AgentRelease>("/releases/agent/latest/meta"),
    staleTime: 5 * 60 * 1000,
  })
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  const units = ["KB", "MB", "GB"]
  let value = bytes / 1024
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit += 1
  }
  return `${value.toFixed(value < 10 ? 1 : 0)} ${units[unit]}`
}
