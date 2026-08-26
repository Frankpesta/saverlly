import type { ReactNode } from "react"
import { BrandLogo } from "@/components/brand-logo"

export function AuthShell({ tagline, children }: { tagline: string; children: ReactNode }) {
  return (
    <div className="auth-page">
      <div className="auth-form-pane">
        <BrandLogo height={22} className="auth-mobile-logo dark:hidden" />
        <BrandLogo dark height={22} className="auth-mobile-logo hidden dark:block" />
        {children}
      </div>
      <aside className="auth-brand-pane">
        <BrandLogo dark height={24} className="relative z-10" />
        <div className="relative z-10 mt-auto max-w-sm">
          <p className="text-xs font-semibold tracking-[0.14em] text-[var(--brand-teal)] uppercase">Saverlly workspace</p>
          <p className="mt-4 text-4xl font-medium leading-[1.08] tracking-[-0.045em] text-white">{tagline}</p>
        </div>
        <div className="auth-brand-orbit auth-brand-orbit-one" aria-hidden />
        <div className="auth-brand-orbit auth-brand-orbit-two" aria-hidden />
        <div className="auth-brand-grid" aria-hidden />
      </aside>
    </div>
  )
}
