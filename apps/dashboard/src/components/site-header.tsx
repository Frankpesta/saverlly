import { GlobalSearch } from "@/components/global-search"
import { NotificationBell } from "@/components/notifications/notification-bell"
import { SidebarTrigger } from "@/components/ui/sidebar"

export function SiteHeader({ title }: { title: string }) {
  return (
    <header className="sticky top-0 z-10 flex h-(--header-height) shrink-0 items-center border-b border-black/5 bg-[var(--page-plane)]/80 backdrop-blur-md transition-[width,height] ease-linear">
      <div className="flex w-full items-center justify-between gap-3 px-5 sm:px-7 lg:px-10">
        <div className="flex min-w-0 items-center gap-3">
          <SidebarTrigger className="shrink-0 rounded-lg border border-transparent text-muted-foreground hover:border-border hover:bg-background hover:text-foreground" />
          <div className="min-w-0">
            <h1 className="truncate text-lg font-semibold tracking-tight">{title}</h1>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <NotificationBell />
          <GlobalSearch />
        </div>
      </div>
    </header>
  )
}
