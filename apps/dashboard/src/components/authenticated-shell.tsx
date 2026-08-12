"use client"

import * as React from "react"
import { usePathname, useRouter } from "next/navigation"
import { AppSidebar, type NavItem } from "@/components/app-sidebar"
import { SiteHeader } from "@/components/site-header"
import { DashboardFooter } from "@/components/dashboard-footer"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"

export function AuthenticatedShell({
  homeUrl,
  loginPath,
  fallbackTitle,
  navMain,
  navSecondary,
  user,
  children,
}: {
  homeUrl: string
  loginPath: string
  fallbackTitle: string
  navMain: NavItem[]
  navSecondary?: NavItem[]
  user: { name: string; email: string }
  children: React.ReactNode
}) {
  const router = useRouter()
  const pathname = usePathname()

  const activeItem = [...navMain, ...(navSecondary ?? [])].find((item) =>
    pathname.startsWith(item.url),
  )

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" })
    router.push(loginPath)
    router.refresh()
  }

  return (
    <SidebarProvider
      style={
        {
          "--sidebar-width": "calc(var(--spacing) * 64)",
          "--header-height": "calc(var(--spacing) * 12)",
        } as React.CSSProperties
      }
    >
      <AppSidebar
        homeUrl={homeUrl}
        navMain={navMain}
        navSecondary={navSecondary}
        user={user}
        onLogout={handleLogout}
      />
      <SidebarInset className="bg-[var(--page-plane)]">
        <SiteHeader title={activeItem?.title ?? fallbackTitle} />
        <div className="flex flex-1 flex-col gap-6 p-6 md:p-8">{children}</div>
        <DashboardFooter label={fallbackTitle} />
      </SidebarInset>
    </SidebarProvider>
  )
}
