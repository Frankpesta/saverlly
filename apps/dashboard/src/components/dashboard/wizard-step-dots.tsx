import { cn } from "@/lib/utils"

export function WizardStepDots({ count, current }: { count: number; current: number }) {
  return (
    <div className="mb-1 flex items-center gap-1.5">
      {Array.from({ length: count }).map((_, i) => (
        <span
          key={i}
          className={cn(
            "h-1.5 flex-1 rounded-full transition-colors",
            i <= current ? "bg-[var(--brand-teal)]" : "bg-muted",
          )}
        />
      ))}
    </div>
  )
}
