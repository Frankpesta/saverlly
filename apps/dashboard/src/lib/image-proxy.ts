/** Rewrites an absolute image URL to route through `/api/image-proxy` — see that route for why
 * (mixed-content HTTP images silently failing to load on the HTTPS-served dashboard). */
export function proxiedImageUrl(url: string): string {
  return `/api/image-proxy?url=${encodeURIComponent(url)}`
}

/**
 * Same thing, but absolute.
 *
 * The announcement preview renders the real overlay document inside a `srcDoc` iframe sandboxed
 * without `allow-same-origin`, so it has an opaque origin. A root-relative `/api/...` there
 * resolves against the parent's base URL rather than anything of its own — which happens to
 * work, but only incidentally. Pinning the origin removes the ambiguity, and costs nothing.
 *
 * Falls back to the relative form during SSR, where there is no `window` to read an origin from
 * and the markup is only ever hydrated on the client anyway.
 */
export function absoluteProxiedImageUrl(url: string): string {
  const path = proxiedImageUrl(url)
  return typeof window === "undefined" ? path : `${window.location.origin}${path}`
}
