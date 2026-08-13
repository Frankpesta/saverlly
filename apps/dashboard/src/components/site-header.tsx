import { GlobalSearch } from "@/components/global-search"
import { SidebarTrigger } from "@/components/ui/sidebar"

export function SiteHeader({ title }: { title: string }) {
  return (
    <header className="sticky top-0 z-10 flex h-(--header-height) shrink-0 items-center border-b border-black/5 bg-[var(--page-plane)]/80 backdrop-blur-md transition-[width,height] ease-linear">
      <div className="flex w-full items-center justify-between px-5 sm:px-7 lg:px-10">
        <div className="flex items-center gap-3">
          <SidebarTrigger className="rounded-lg border border-transparent text-muted-foreground hover:border-border hover:bg-background hover:text-foreground" />
          <div>
            <h1 className="text-lg font-semibold tracking-tight">{title}</h1>
          </div>
        </div>
        <GlobalSearch />
      </div>
    </header>
  )
}
