import type { ReactNode } from "react"
import { BrandLogo } from "@/components/brand-logo"

/** The dark brand panel is first in the DOM and the form pane second, so the sign-in form
 * lands on the right. The client asked for this explicitly, twice (once for admin, once for
 * portal) because both share this shell. Order matters here, not just the CSS grid columns:
 * .auth-mobile-logo is positioned relative to whichever pane renders first below the 767px
 * breakpoint, where the brand pane is hidden entirely (see .auth-page in globals.css). */
export function AuthShell({ tagline, children }: { tagline: string; children: ReactNode }) {
  return (
    <div className="auth-page">
      <aside className="auth-brand-pane">
        <BrandLogo dark height={40} className="relative z-10" />
        <div className="relative z-10 mt-auto max-w-sm">
          <p className="text-xs font-semibold tracking-[0.14em] text-[var(--brand-teal)] uppercase">Saverlly workspace</p>
          <p className="mt-4 text-4xl font-medium leading-[1.08] tracking-[-0.045em] text-white">{tagline}</p>
        </div>
        <div className="auth-brand-orbit auth-brand-orbit-one" aria-hidden />
        <div className="auth-brand-orbit auth-brand-orbit-two" aria-hidden />
        <div className="auth-brand-grid" aria-hidden />
      </aside>
      <div className="auth-form-pane">
        <BrandLogo height={36} className="auth-mobile-logo dark:hidden" />
        <BrandLogo dark height={36} className="auth-mobile-logo hidden dark:block" />
        {children}
      </div>
    </div>
  )
}
