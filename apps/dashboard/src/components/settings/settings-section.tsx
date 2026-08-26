import type { ReactNode } from "react"
import { cn } from "@/lib/utils"

/** A calm, document-like settings group. Settings are read and edited in sequence, so this
 * deliberately uses a rule and whitespace rather than another floating card. */
export function SettingsSection({
  title,
  description,
  children,
  className,
}: {
  title: string
  description?: string
  children: ReactNode
  className?: string
}) {
  return (
    <section className={cn("border-t border-black/[0.09] dark:border-white/10 pt-5", className)}>
      <div className="mb-5 flex flex-col gap-1">
        <h3 className="text-sm font-semibold tracking-tight">{title}</h3>
        {description && <p className="text-sm leading-6 text-muted-foreground">{description}</p>}
      </div>
      {children}
    </section>
  )
}
