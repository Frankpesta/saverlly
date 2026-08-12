import "server-only"
import type { cookies } from "next/headers"
import { decodeJwt } from "jose"
import type { TokenPair } from "@/lib/api/types"
import { ACCESS_TOKEN_COOKIE, REFRESH_TOKEN_COOKIE } from "@/lib/auth/constants"

type CookieStore = Awaited<ReturnType<typeof cookies>>

const baseCookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
}

function maxAgeFromExp(token: string): number {
  const { exp } = decodeJwt(token)
  if (!exp) return 0
  return Math.max(0, exp - Math.floor(Date.now() / 1000))
}

export function setSessionCookies(cookies: CookieStore, tokens: TokenPair) {
  cookies.set(ACCESS_TOKEN_COOKIE, tokens.accessToken, {
    ...baseCookieOptions,
    maxAge: maxAgeFromExp(tokens.accessToken),
  })
  cookies.set(REFRESH_TOKEN_COOKIE, tokens.refreshToken, {
    ...baseCookieOptions,
    maxAge: maxAgeFromExp(tokens.refreshToken),
  })
}

export function clearSessionCookies(cookies: CookieStore) {
  cookies.delete(ACCESS_TOKEN_COOKIE)
  cookies.delete(REFRESH_TOKEN_COOKIE)
}
