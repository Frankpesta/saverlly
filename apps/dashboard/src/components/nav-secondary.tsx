"use client"

import * as React from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"

import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar"
import type { NavItem } from "@/components/app-sidebar"
import { cn } from "@/lib/utils"

export function NavSecondary({
  items,
  ...props
}: {
  items: NavItem[]
} & React.ComponentPropsWithoutRef<typeof SidebarGroup>) {
  const pathname = usePathname()
  const { setOpenMobile } = useSidebar()

  return (
    <SidebarGroup {...props} className={cn("p-0", props.className)}>
      <SidebarGroupContent>
        <SidebarMenu>
          {items.map((item) => {
            const active = pathname.startsWith(item.url)
            return (
              <SidebarMenuItem key={item.title}>
                <SidebarMenuButton
                  asChild
                  isActive={active}
                  className={cn(
                    "h-10 rounded-xl px-3 font-medium transition-all",
                    active
                      ? "bg-card text-foreground shadow-sm ring-1 ring-black/8 [&_svg]:text-[var(--brand-teal)]"
                      : "text-sidebar-foreground/70 hover:bg-sidebar-accent/70 hover:text-sidebar-foreground",
                  )}
                >
                  <Link href={item.url} onClick={() => setOpenMobile(false)}>
                    {item.icon}
                    <span>{item.title}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            )
          })}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  )
}
