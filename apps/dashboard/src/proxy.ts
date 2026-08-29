import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { decodeJwt } from "jose"
import { ACCESS_TOKEN_COOKIE, REFRESH_TOKEN_COOKIE } from "@/lib/auth/constants"
import { backendUrl } from "@/lib/api/backend"
import type { JwtPayload, TokenPair } from "@/lib/api/types"

const LOGIN_PATH = {
  admin: "/admin/login",
  portal: "/portal/login",
} as const

// Reachable with no session at all — same as the login page itself.
const FORGOT_PASSWORD_PATH = {
  admin: "/admin/forgot-password",
  portal: "/portal/forgot-password",
} as const
const RESET_PASSWORD_PATH = {
  admin: "/admin/reset-password",
  portal: "/portal/reset-password",
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
 * Exchanges the refresh cookie for a fresh token pair directly against the backend. proxy.ts
 * runs in the middleware layer, which has no access to next/headers' request-scoped cookies()
 * the way Route Handlers do (lib/auth/session.ts's refreshSession() can't be reused here) — so
 * this reads/writes cookies via NextRequest/NextResponse's own cookie APIs instead.
 */
async function tryRefresh(request: NextRequest): Promise<TokenPair | null> {
  const refreshToken = request.cookies.get(REFRESH_TOKEN_COOKIE)?.value
  if (!refreshToken) return null

  try {
    const res = await fetch(backendUrl("/auth/refresh"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken }),
      cache: "no-store",
    })
    if (!res.ok) return null
    return (await res.json()) as TokenPair
  } catch {
    return null
  }
}

function withSessionCookies(response: NextResponse, tokens: TokenPair): NextResponse {
  const baseCookieOptions = {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
  }
  const now = Math.floor(Date.now() / 1000)
  const accessExp = decodeJwt(tokens.accessToken).exp ?? now
  const refreshExp = decodeJwt(tokens.refreshToken).exp ?? now
  response.cookies.set(ACCESS_TOKEN_COOKIE, tokens.accessToken, {
    ...baseCookieOptions,
    maxAge: Math.max(0, accessExp - now),
  })
  response.cookies.set(REFRESH_TOKEN_COOKIE, tokens.refreshToken, {
    ...baseCookieOptions,
    maxAge: Math.max(0, refreshExp - now),
  })
  return response
}

/**
 * UX-level route gating only — every proxied API call is independently re-checked by the
 * backend's own JwtAuthGuard/RolesGuard, so this never needs to verify the JWT signature,
 * just decode it to steer navigation.
 *
 * An expired access token does NOT mean a logged-out user: the refresh token cookie is
 * long-lived (see JWT_REFRESH_EXPIRES_IN on the backend) specifically so a session survives
 * past the access token's own TTL. Only a failed/absent refresh actually ends the session.
 */
export async function proxy(request: NextRequest): Promise<NextResponse> {
  const { pathname } = request.nextUrl
  const namespace = pathname.startsWith("/admin") ? "admin" : "portal"

  if (
    pathname === LOGIN_PATH[namespace] ||
    pathname === FORGOT_PASSWORD_PATH[namespace] ||
    pathname === RESET_PASSWORD_PATH[namespace]
  ) {
    return NextResponse.next()
  }

  const token = request.cookies.get(ACCESS_TOKEN_COOKIE)?.value
  let payload = token ? safeDecode(token) : null
  let refreshedTokens: TokenPair | null = null

  if (!payload || payload.exp * 1000 < Date.now()) {
    refreshedTokens = await tryRefresh(request)
    payload = refreshedTokens ? safeDecode(refreshedTokens.accessToken) : null
    if (!payload) {
      return NextResponse.redirect(new URL(LOGIN_PATH[namespace], request.url))
    }
  }

  const withRefreshedCookies = (response: NextResponse) =>
    refreshedTokens ? withSessionCookies(response, refreshedTokens) : response

  const allowedHere = namespace === "admin" ? payload.role === "ADMIN" : payload.role !== "ADMIN"
  if (!allowedHere) {
    const otherNamespace = namespace === "admin" ? "portal" : "admin"
    return withRefreshedCookies(NextResponse.redirect(new URL(LOGIN_PATH[otherNamespace], request.url)))
  }

  if (payload.mustChangePassword && pathname !== CHANGE_PASSWORD_PATH[namespace]) {
    return withRefreshedCookies(NextResponse.redirect(new URL(CHANGE_PASSWORD_PATH[namespace], request.url)))
  }

  return withRefreshedCookies(NextResponse.next())
}

export const config = {
  matcher: ["/admin/:path*", "/portal/:path*"],
}
