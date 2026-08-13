import type { UserRole } from "@/lib/api/types"

export function portalForRole(role: UserRole): "admin" | "portal" {
  return role === "ADMIN" ? "admin" : "portal"
}

export function homeUrlForRole(role: UserRole): string {
  return role === "ADMIN" ? "/admin/overview" : "/portal/overview"
}
