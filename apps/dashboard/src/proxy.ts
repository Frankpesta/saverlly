import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { decodeJwt } from "jose"
import { ACCESS_TOKEN_COOKIE } from "@/lib/auth/constants"
import type { JwtPayload } from "@/lib/api/types"

const LOGIN_PATH = {
  admin: "/admin/login",
  portal: "/portal/login",
} as const

const CHANGE_PASSWORD_PATH = {
  admin: "/admin/change-password",
  portal: "/portal/change-password",
} as const

function safeDecode(token: string): JwtPayload | null {
  try {
    return decodeJwt(token) as JwtPayload
  } catch {
    return null
  }
}

/**
 * UX-level route gating only — every proxied API call is independently re-checked by the
 * backend's own JwtAuthGuard/RolesGuard, so this never needs to verify the JWT signature,
 * just decode it to steer navigation.
 */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl
  const namespace = pathname.startsWith("/admin") ? "admin" : "portal"

  if (pathname === LOGIN_PATH[namespace]) {
    return NextResponse.next()
  }

  const token = request.cookies.get(ACCESS_TOKEN_COOKIE)?.value
  const payload = token ? safeDecode(token) : null
  const expired = !payload || payload.exp * 1000 < Date.now()

  if (expired) {
    return NextResponse.redirect(new URL(LOGIN_PATH[namespace], request.url))
  }

  const allowedHere = namespace === "admin" ? payload.role === "ADMIN" : payload.role !== "ADMIN"
  if (!allowedHere) {
    const otherNamespace = namespace === "admin" ? "portal" : "admin"
    return NextResponse.redirect(new URL(LOGIN_PATH[otherNamespace], request.url))
  }

  if (payload.mustChangePassword && pathname !== CHANGE_PASSWORD_PATH[namespace]) {
    return NextResponse.redirect(new URL(CHANGE_PASSWORD_PATH[namespace], request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: ["/admin/:path*", "/portal/:path*"],
}
