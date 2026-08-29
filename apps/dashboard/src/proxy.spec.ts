/**
 * @jest-environment node
 */
import { NextRequest } from "next/server"
import { UnsecuredJWT } from "jose"
import { proxy } from "@/proxy"
import { ACCESS_TOKEN_COOKIE, REFRESH_TOKEN_COOKIE } from "@/lib/auth/constants"
import type { UserRole } from "@/lib/api/types"

function tokenFor(
  role: UserRole,
  expiresInSeconds = 900,
  mustChangePassword = false,
): string {
  return new UnsecuredJWT({ sub: "user-1", role, kioskId: null, mustChangePassword })
    .setExpirationTime(Math.floor(Date.now() / 1000) + expiresInSeconds)
    .encode()
}

function requestFor(path: string, token?: string): NextRequest {
  const req = new NextRequest(new URL(path, "http://localhost:3001"))
  if (token) {
    req.cookies.set(ACCESS_TOKEN_COOKIE, token)
  }
  return req
}

describe("proxy route gating", () => {
  const originalFetch = global.fetch

  beforeEach(() => {
    global.fetch = jest.fn() as unknown as typeof fetch
  })

  afterEach(() => {
    global.fetch = originalFetch
  })

  it("lets an unauthenticated request through to /admin/login", async () => {
    const res = await proxy(requestFor("/admin/login"))
    expect(res.status).toBe(200) // NextResponse.next() reports 200 with no redirect header
    expect(res.headers.get("location")).toBeNull()
  })

  it("lets an unauthenticated request through to /portal/login", async () => {
    const res = await proxy(requestFor("/portal/login"))
    expect(res.headers.get("location")).toBeNull()
  })

  it.each([
    "/admin/forgot-password",
    "/admin/reset-password",
    "/portal/forgot-password",
    "/portal/reset-password",
  ])("lets an unauthenticated request through to %s", async (path) => {
    const res = await proxy(requestFor(path))
    expect(res.headers.get("location")).toBeNull()
  })

  it("redirects to /admin/login when there is no session cookie", async () => {
    const res = await proxy(requestFor("/admin/kiosks"))
    expect(res.headers.get("location")).toBe("http://localhost:3001/admin/login")
    expect(global.fetch).not.toHaveBeenCalled() // no refresh cookie to even try
  })

  it("redirects to /portal/login when there is no session cookie", async () => {
    const res = await proxy(requestFor("/portal/locations"))
    expect(res.headers.get("location")).toBe("http://localhost:3001/portal/login")
  })

  it("redirects to login when the access token is expired and there is no refresh cookie to fall back on", async () => {
    const expired = tokenFor("ADMIN", -60)
    const res = await proxy(requestFor("/admin/kiosks", expired))
    expect(res.headers.get("location")).toBe("http://localhost:3001/admin/login")
  })

  it("redirects to login when the cookie value isn't a valid JWT", async () => {
    const res = await proxy(requestFor("/admin/kiosks", "not-a-jwt"))
    expect(res.headers.get("location")).toBe("http://localhost:3001/admin/login")
  })

  it("allows an ADMIN into /admin/*", async () => {
    const res = await proxy(requestFor("/admin/kiosks", tokenFor("ADMIN")))
    expect(res.headers.get("location")).toBeNull()
  })

  it("bounces an ADMIN out of /portal/* to /admin/login", async () => {
    const res = await proxy(requestFor("/portal/locations", tokenFor("ADMIN")))
    expect(res.headers.get("location")).toBe("http://localhost:3001/admin/login")
  })

  it("allows a KIOSK_OWNER into /portal/*", async () => {
    const res = await proxy(requestFor("/portal/locations", tokenFor("KIOSK_OWNER")))
    expect(res.headers.get("location")).toBeNull()
  })

  it("allows a LOCATION_MANAGER into /portal/*", async () => {
    const res = await proxy(requestFor("/portal/locations", tokenFor("LOCATION_MANAGER")))
    expect(res.headers.get("location")).toBeNull()
  })

  it("bounces a KIOSK_OWNER out of /admin/* to /portal/login", async () => {
    const res = await proxy(requestFor("/admin/kiosks", tokenFor("KIOSK_OWNER")))
    expect(res.headers.get("location")).toBe("http://localhost:3001/portal/login")
  })

  it("redirects to /admin/change-password when mustChangePassword is true", async () => {
    const res = await proxy(requestFor("/admin/kiosks", tokenFor("ADMIN", 900, true)))
    expect(res.headers.get("location")).toBe("http://localhost:3001/admin/change-password")
  })

  it("redirects to /portal/change-password when mustChangePassword is true", async () => {
    const res = await proxy(requestFor("/portal/locations", tokenFor("KIOSK_OWNER", 900, true)))
    expect(res.headers.get("location")).toBe("http://localhost:3001/portal/change-password")
  })

  it("does not redirect a request already on the change-password page", async () => {
    const res = await proxy(requestFor("/admin/change-password", tokenFor("ADMIN", 900, true)))
    expect(res.headers.get("location")).toBeNull()
  })

  it("behaves exactly as before when mustChangePassword is false (no regression)", async () => {
    const res = await proxy(requestFor("/admin/kiosks", tokenFor("ADMIN", 900, false)))
    expect(res.headers.get("location")).toBeNull()
  })
})

describe("proxy silent refresh on an expired access token", () => {
  const originalFetch = global.fetch

  afterEach(() => {
    global.fetch = originalFetch
  })

  function requestWithRefreshCookie(path: string, accessToken: string | undefined, refreshToken: string): NextRequest {
    const req = requestFor(path, accessToken)
    req.cookies.set(REFRESH_TOKEN_COOKIE, refreshToken)
    return req
  }

  it("silently refreshes instead of logging the user out when only the access token has expired", async () => {
    const expiredAccess = tokenFor("ADMIN", -60)
    const freshAccess = tokenFor("ADMIN", 900)
    const freshRefresh = tokenFor("ADMIN", 60 * 60 * 24 * 30)
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ accessToken: freshAccess, refreshToken: freshRefresh }),
    }) as unknown as typeof fetch

    const res = await proxy(requestWithRefreshCookie("/admin/kiosks", expiredAccess, "some-refresh-token"))

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining("/auth/refresh"),
      expect.objectContaining({ method: "POST" }),
    )
    expect(res.headers.get("location")).toBeNull() // navigation proceeds, no bounce to login
    expect(res.cookies.get(ACCESS_TOKEN_COOKIE)?.value).toBe(freshAccess)
    expect(res.cookies.get(REFRESH_TOKEN_COOKIE)?.value).toBe(freshRefresh)
  })

  it("still redirects to login when the access token is expired and the refresh call itself fails", async () => {
    const expiredAccess = tokenFor("ADMIN", -60)
    global.fetch = jest.fn().mockResolvedValue({ ok: false }) as unknown as typeof fetch

    const res = await proxy(requestWithRefreshCookie("/admin/kiosks", expiredAccess, "stale-refresh-token"))

    expect(res.headers.get("location")).toBe("http://localhost:3001/admin/login")
  })

  it("does not need a refresh call at all when the access token is still valid", async () => {
    global.fetch = jest.fn() as unknown as typeof fetch
    const res = await proxy(requestWithRefreshCookie("/admin/kiosks", tokenFor("ADMIN"), "unused-refresh-token"))
    expect(global.fetch).not.toHaveBeenCalled()
    expect(res.headers.get("location")).toBeNull()
  })
})
