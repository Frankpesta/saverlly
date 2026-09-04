import { cn } from "@/lib/utils"

/** Shared active/inactive styling for a sidebar nav item. Used by both NavMain and
 * NavSecondary so the two never drift out of sync.
 *
 * The active item used to be a fully saturated teal pill with white text, which made a piece of
 * navigation the loudest thing on the screen, louder than the page's own primary action. It now
 * marks the current view with a teal rail and a teal icon over a faint lift, so the brand colour
 * still does the marking without shouting over the content. */
export function navItemClassName(active: boolean): string {
  return cn(
    "h-10 rounded-md px-3 font-medium transition-colors",
    active
      ? "relative bg-white/[0.07] text-white before:absolute before:top-1/2 before:left-0 before:h-5 before:w-[3px] before:-translate-y-1/2 before:rounded-r-full before:bg-[var(--brand-teal)] [&_svg]:text-[var(--brand-teal)]"
      : "text-sidebar-foreground/66 hover:bg-sidebar-accent hover:text-sidebar-foreground [&_svg]:text-sidebar-foreground/60 hover:[&_svg]:text-sidebar-foreground",
  )
}
