import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import {
  decodeAccessToken,
  homeUrlForRole,
  loginRequest,
  portalForRole,
} from "@/lib/auth/session"
import { setSessionCookies } from "@/lib/auth/cookies"

export async function POST(request: Request) {
  const { email, password, portal } = (await request.json()) as {
    email?: string
    password?: string
    portal?: "admin" | "portal"
  }

  if (!email || !password || !portal) {
    return NextResponse.json({ error: "Missing credentials." }, { status: 400 })
  }

  const tokens = await loginRequest(email, password)
  if (!tokens) {
    return NextResponse.json({ error: "Invalid email or password." }, { status: 401 })
  }

  const payload = decodeAccessToken(tokens.accessToken)
  const actualPortal = portalForRole(payload.role)

  if (actualPortal !== portal) {
    const label = actualPortal === "admin" ? "Admin Console" : "Kiosk Portal"
    return NextResponse.json(
      { error: `This account belongs to the ${label}. Please sign in there instead.` },
      { status: 403 },
    )
  }

  const cookieStore = await cookies()
  setSessionCookies(cookieStore, tokens)

  return NextResponse.json({ redirectTo: homeUrlForRole(payload.role) })
}
