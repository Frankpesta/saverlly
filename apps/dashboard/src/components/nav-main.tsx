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
import { navItemClassName } from "@/lib/nav-item-class"

export function NavMain({
  items,
}: {
  items: {
    group?: string
    title: string
    url: string
    icon?: React.ReactNode
  }[]
}) {
  const pathname = usePathname()
  const { setOpenMobile } = useSidebar()

  return (
    <SidebarGroup className="p-0">
      <SidebarGroupContent className="flex flex-col gap-1">
        <SidebarMenu>
          {items.map((item, index) => {
            const active = pathname.startsWith(item.url)
            return (
              <SidebarMenuItem key={item.title}>
                {item.group && item.group !== items[index - 1]?.group && <p className="px-3 pt-5 pb-2 text-xs font-medium text-sidebar-foreground/60">{item.group}</p>}
                <SidebarMenuButton
                  asChild
                  tooltip={item.title}
                  isActive={active}
                  className={navItemClassName(active)}
                >
                  <Link aria-current={active ? "page" : undefined} href={item.url} onClick={() => setOpenMobile(false)}>
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
