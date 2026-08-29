/** Rewrites an absolute image URL to route through `/api/image-proxy` — see that route for why
 * (mixed-content HTTP images silently failing to load on the HTTPS-served dashboard). */
export function proxiedImageUrl(url: string): string {
  return `/api/image-proxy?url=${encodeURIComponent(url)}`
}
