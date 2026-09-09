import { GlobalSearch } from "@/components/global-search"
import { NotificationBell } from "@/components/notifications/notification-bell"
import { ThemeToggle } from "@/components/theme-toggle"
import { SidebarTrigger } from "@/components/ui/sidebar"

export function SiteHeader({ title }: { title: string }) {
  return (
    <header className="sticky top-0 z-10 flex h-(--header-height) shrink-0 items-center border-b border-border/70 bg-[var(--page-plane)]/80 backdrop-blur-md transition-[width,height] ease-linear">
      <div className="flex w-full items-center justify-between gap-3 px-4 sm:px-6 xl:px-8">
        <div className="flex min-w-0 items-center gap-3">
          <SidebarTrigger className="shrink-0 rounded-xl border border-transparent text-muted-foreground hover:border-border hover:bg-background hover:text-foreground" />
          <div className="min-w-0">
            <p className="truncate text-label text-muted-foreground">{title}</p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <ThemeToggle />
          <NotificationBell />
          <GlobalSearch />
        </div>
      </div>
    </header>
  )
}
