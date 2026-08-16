/**
 * @jest-environment node
 */
import { NextRequest } from "next/server"
import { UnsecuredJWT } from "jose"
import { proxy } from "@/proxy"
import { ACCESS_TOKEN_COOKIE } from "@/lib/auth/constants"
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
  it("lets an unauthenticated request through to /admin/login", () => {
    const res = proxy(requestFor("/admin/login"))
    expect(res.status).toBe(200) // NextResponse.next() reports 200 with no redirect header
    expect(res.headers.get("location")).toBeNull()
  })

  it("lets an unauthenticated request through to /portal/login", () => {
    const res = proxy(requestFor("/portal/login"))
    expect(res.headers.get("location")).toBeNull()
  })

  it("redirects to /admin/login when there is no session cookie", () => {
    const res = proxy(requestFor("/admin/kiosks"))
    expect(res.headers.get("location")).toBe("http://localhost:3001/admin/login")
  })

  it("redirects to /portal/login when there is no session cookie", () => {
    const res = proxy(requestFor("/portal/locations"))
    expect(res.headers.get("location")).toBe("http://localhost:3001/portal/login")
  })

  it("redirects to login when the access token is expired", () => {
    const expired = tokenFor("ADMIN", -60)
    const res = proxy(requestFor("/admin/kiosks", expired))
    expect(res.headers.get("location")).toBe("http://localhost:3001/admin/login")
  })

  it("redirects to login when the cookie value isn't a valid JWT", () => {
    const res = proxy(requestFor("/admin/kiosks", "not-a-jwt"))
    expect(res.headers.get("location")).toBe("http://localhost:3001/admin/login")
  })

  it("allows an ADMIN into /admin/*", () => {
    const res = proxy(requestFor("/admin/kiosks", tokenFor("ADMIN")))
    expect(res.headers.get("location")).toBeNull()
  })

  it("bounces an ADMIN out of /portal/* to /admin/login", () => {
    const res = proxy(requestFor("/portal/locations", tokenFor("ADMIN")))
    expect(res.headers.get("location")).toBe("http://localhost:3001/admin/login")
  })

  it("allows a KIOSK_OWNER into /portal/*", () => {
    const res = proxy(requestFor("/portal/locations", tokenFor("KIOSK_OWNER")))
    expect(res.headers.get("location")).toBeNull()
  })

  it("allows a LOCATION_MANAGER into /portal/*", () => {
    const res = proxy(requestFor("/portal/locations", tokenFor("LOCATION_MANAGER")))
    expect(res.headers.get("location")).toBeNull()
  })

  it("bounces a KIOSK_OWNER out of /admin/* to /portal/login", () => {
    const res = proxy(requestFor("/admin/kiosks", tokenFor("KIOSK_OWNER")))
    expect(res.headers.get("location")).toBe("http://localhost:3001/portal/login")
  })

  it("redirects to /admin/change-password when mustChangePassword is true", () => {
    const res = proxy(requestFor("/admin/kiosks", tokenFor("ADMIN", 900, true)))
    expect(res.headers.get("location")).toBe("http://localhost:3001/admin/change-password")
  })

  it("redirects to /portal/change-password when mustChangePassword is true", () => {
    const res = proxy(requestFor("/portal/locations", tokenFor("KIOSK_OWNER", 900, true)))
    expect(res.headers.get("location")).toBe("http://localhost:3001/portal/change-password")
  })

  it("does not redirect a request already on the change-password page", () => {
    const res = proxy(requestFor("/admin/change-password", tokenFor("ADMIN", 900, true)))
    expect(res.headers.get("location")).toBeNull()
  })

  it("behaves exactly as before when mustChangePassword is false (no regression)", () => {
    const res = proxy(requestFor("/admin/kiosks", tokenFor("ADMIN", 900, false)))
    expect(res.headers.get("location")).toBeNull()
  })
})
