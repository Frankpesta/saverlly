import Image from "next/image"

// Pre-downsampled (box-filter, not runtime-scaled) small wordmark assets — the full-res
// source is ~230px tall; scaling that down to ~22px at render time produces moiré/wave
// artifacts on the thin letterforms, so a properly resampled small version ships instead.
// See apps/dashboard/design/ for the full-res originals if a larger logo is ever needed.
const LOGO_SM = { width: 188, height: 64 }

export function BrandLogo({
  className,
  height = 24,
  dark = false,
}: {
  className?: string
  height?: number
  /** Render the white-on-transparent mark for use on a dark/teal panel. */
  dark?: boolean
}) {
  return (
    <Image
      src={dark ? "/brand/logo-dark-bg-sm.png" : "/brand/logo-light-bg-sm.png"}
      alt="Saverlly"
      width={LOGO_SM.width}
      height={LOGO_SM.height}
      // Explicit numeric width, not "auto" — this renders inside flex-column containers
      // (e.g. the auth split panel) where default align-items: stretch would otherwise
      // stretch an "auto" width to fill the container while height stays pinned, badly
      // distorting the wordmark.
      style={{ height, width: (height * LOGO_SM.width) / LOGO_SM.height, flexShrink: 0 }}
      className={className}
      priority
      unoptimized
    />
  )
}

export function BrandMark({
  className,
  size = 24,
}: {
  className?: string
  size?: number
}) {
  return (
    <Image
      src="/brand/icon-filled.png"
      alt="Saverlly"
      width={312}
      height={312}
      style={{ height: size, width: size }}
      className={className}
      unoptimized
    />
  )
}
