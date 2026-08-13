export function DashboardFooter({ label }: { label: string }) {
  return (
    <footer className="flex flex-col items-center justify-between gap-2 border-t border-black/8 px-6 py-4 text-xs text-muted-foreground sm:flex-row md:px-8">
      <span>© {new Date().getFullYear()} Saverlly. All rights reserved.</span>
      <span>{label}</span>
    </footer>
  )
}
