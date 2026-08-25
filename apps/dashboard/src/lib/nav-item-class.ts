import { cn } from "@/lib/utils"

/** Shared active/inactive styling for a sidebar nav item — used by both NavMain and
 * NavSecondary so the two never drift out of sync. The dark rail uses teal exclusively to
 * mark the current view. */
export function navItemClassName(active: boolean): string {
  return cn(
    "h-10 rounded-md px-3 font-medium transition-colors",
    active
      ? "bg-[var(--brand-teal)] text-white [&_svg]:text-white"
      : "text-sidebar-foreground/66 hover:bg-sidebar-accent hover:text-sidebar-foreground [&_svg]:text-sidebar-foreground/60 hover:[&_svg]:text-sidebar-foreground",
  )
}
