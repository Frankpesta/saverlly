"use client"

import * as React from "react"
import Link from "next/link"

import { NavMain } from "@/components/nav-main"
import { NavSecondary } from "@/components/nav-secondary"
import { NavUser } from "@/components/nav-user"
import { BrandLogo } from "@/components/brand-logo"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"

export type NavItem = {
  title: string
  url: string
  icon?: React.ReactNode
}

export function AppSidebar({
  homeUrl,
  profileHref,
  navMain,
  navSecondary,
  user,
  onLogout,
  ...props
}: React.ComponentProps<typeof Sidebar> & {
  homeUrl: string
  profileHref: string
  navMain: NavItem[]
  navSecondary?: NavItem[]
  user: { name: string; email: string; avatar?: string }
  onLogout: () => void
}) {
  return (
    <Sidebar collapsible="offcanvas" className="border-r border-sidebar-border bg-sidebar" {...props}>
      <SidebarHeader className="px-3 py-5">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              asChild
              className="h-10 rounded-md data-[slot=sidebar-menu-button]:px-3!"
            >
              <Link href={homeUrl}>
                <BrandLogo height={22} dark />
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent className="px-2 pb-3">
        <NavMain items={navMain} />
        {navSecondary && (
          <NavSecondary items={navSecondary} className="mt-auto" />
        )}
      </SidebarContent>
      <SidebarFooter className="border-t border-sidebar-border/70 p-3">
        <NavUser user={user} profileHref={profileHref} onLogout={onLogout} />
      </SidebarFooter>
    </Sidebar>
  )
}
