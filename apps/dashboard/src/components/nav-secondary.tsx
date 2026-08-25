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
import { navItemClassName } from "@/lib/nav-item-class"

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
                  className={navItemClassName(active)}
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
