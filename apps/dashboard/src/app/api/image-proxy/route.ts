import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

/**
 * Streams an arbitrary image URL back through the dashboard's own (HTTPS) origin.
 *
 * Announcement images can point at the backend's own upload storage, which today is served
 * over plain HTTP (`PUBLIC_BACKEND_URL`, no TLS yet. See DEPLOYMENT.md's known limitations).
 * A bare `<img src="http://...">` on the HTTPS-served dashboard gets silently mixed-content
 * blocked by the browser (Chrome auto-upgrades it to https, which then fails against a server
 * that doesn't speak TLS). The request never even shows up as a visible error, it just never
 * renders. Fetching it server-side here and re-serving the bytes over this same-origin HTTPS
 * route sidesteps that entirely, and also works for any arbitrary external image URL a user
 * pastes directly (the wizard still allows that as an alternative to uploading).
 */
export async function GET(request: NextRequest) {
  const target = request.nextUrl.searchParams.get("url")
  if (!target) {
    return new NextResponse(null, { status: 400 })
  }

  let parsed: URL
  try {
    parsed = new URL(target)
  } catch {
    return new NextResponse(null, { status: 400 })
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return new NextResponse(null, { status: 400 })
  }

  let upstream: Response
  try {
    upstream = await fetch(parsed.toString(), { cache: "no-store" })
  } catch {
    return new NextResponse(null, { status: 502 })
  }
  if (!upstream.ok) {
    return new NextResponse(null, { status: 502 })
  }

  const contentType = upstream.headers.get("content-type") ?? ""
  if (!contentType.startsWith("image/")) {
    return new NextResponse(null, { status: 415 })
  }

  const body = await upstream.arrayBuffer()
  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=3600",
    },
  })
}
