import type { ReactNode } from "react"
import { BrandLogo } from "@/components/brand-logo"

export function AuthShell({ tagline, children }: { tagline: string; children: ReactNode }) {
  return (
    <div className="flex min-h-full flex-1">
      <div className="hidden w-[42%] flex-col justify-between bg-[var(--brand-teal)] p-12 md:flex">
        <BrandLogo dark height={22} />
        <p className="max-w-sm text-3xl font-medium leading-tight text-white">{tagline}</p>
      </div>

      <div className="flex flex-1 flex-col items-center justify-center gap-10 p-8">
        <div className="md:hidden">
          <BrandLogo height={22} />
        </div>
        {children}
      </div>
    </div>
  )
}
