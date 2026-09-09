"use client"

import * as React from "react"
import { usePathname, useRouter } from "next/navigation"
import { AppSidebar, type NavItem } from "@/components/app-sidebar"
import { SiteHeader } from "@/components/site-header"
import { DashboardFooter } from "@/components/dashboard-footer"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"

export function AuthenticatedShell({
  homeUrl,
  profileHref,
  loginPath,
  fallbackTitle,
  navMain,
  navSecondary,
  user,
  children,
}: {
  homeUrl: string
  profileHref: string
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
          "--sidebar-width": "calc(var(--spacing) * 60)",
          "--header-height": "calc(var(--spacing) * 16)",
        } as React.CSSProperties
      }
    >
      <a href="#workspace-main" className="fixed top-2 left-2 z-[100] -translate-y-20 rounded-lg bg-foreground px-4 py-3 text-background focus:translate-y-0">Skip to content</a>
      <AppSidebar
        homeUrl={homeUrl}
        profileHref={profileHref}
        navMain={navMain}
        navSecondary={navSecondary}
        user={user}
        onLogout={handleLogout}
      />
      <SidebarInset className="min-h-svh bg-[var(--page-plane)]">
        <SiteHeader title={pathname === profileHref ? "Profile" : activeItem?.title ?? fallbackTitle} />
        <main id="workspace-main" tabIndex={-1} className="flex min-w-0 flex-1 flex-col gap-6 px-4 py-6 outline-none sm:px-6 xl:px-8 xl:py-8"><div className="workspace-content">{children}</div></main>
        <DashboardFooter label={fallbackTitle} />
      </SidebarInset>
    </SidebarProvider>
  )
}
