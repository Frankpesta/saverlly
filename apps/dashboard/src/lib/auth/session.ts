import "server-only"
import { cookies } from "next/headers"
import { decodeJwt } from "jose"
import { backendFetch } from "@/lib/api/backend"
import type { JwtPayload, TokenPair, UserProfile } from "@/lib/api/types"
import { ACCESS_TOKEN_COOKIE, REFRESH_TOKEN_COOKIE } from "@/lib/auth/constants"
import { clearSessionCookies, setSessionCookies } from "@/lib/auth/cookies"

export { portalForRole, homeUrlForRole } from "@/lib/auth/role-routing"

export async function loginRequest(email: string, password: string): Promise<TokenPair | null> {
  const res = await backendFetch("/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  })
  if (!res.ok) return null
  return res.json()
}

export async function logoutRequest(accessToken: string): Promise<void> {
  await backendFetch("/auth/logout", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` },
  })
}

export async function forgotPasswordRequest(email: string): Promise<void> {
  // Always resolves — the backend responds the same way whether or not the email is
  // registered, so there's nothing meaningful to branch on here either.
  await backendFetch("/auth/forgot-password", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  })
}

export async function resetPasswordRequest(
  token: string,
  newPassword: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const res = await backendFetch("/auth/reset-password", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token, newPassword }),
  })
  if (!res.ok) {
    const data = await res.json().catch(() => null)
    const message = Array.isArray(data?.message) ? data.message[0] : data?.message
    return { ok: false, error: message ?? "Could not reset password." }
  }
  return { ok: true }
}

/** Reads the refresh cookie, exchanges it for a fresh token pair, and rotates both cookies. */
export async function refreshSession(): Promise<string | null> {
  const cookieStore = await cookies()
  const refreshToken = cookieStore.get(REFRESH_TOKEN_COOKIE)?.value
  if (!refreshToken) return null

  const res = await backendFetch("/auth/refresh", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refreshToken }),
  })
  if (!res.ok) {
    clearSessionCookies(cookieStore)
    return null
  }

  const tokens: TokenPair = await res.json()
  setSessionCookies(cookieStore, tokens)
  return tokens.accessToken
}

export function decodeAccessToken(token: string): JwtPayload {
  return decodeJwt(token) as JwtPayload
}

export async function getAccessToken(): Promise<string | undefined> {
  const cookieStore = await cookies()
  return cookieStore.get(ACCESS_TOKEN_COOKIE)?.value
}

export async function getCurrentUser(): Promise<UserProfile | null> {
  const accessToken = await getAccessToken()
  if (!accessToken) return null

  const res = await backendFetch("/users/me", {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) return null
  return res.json()
}
