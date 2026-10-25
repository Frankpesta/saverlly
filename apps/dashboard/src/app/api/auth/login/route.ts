import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import {
  decodeAccessToken,
  homeUrlForRole,
  loginRequest,
  logoutRequest,
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

  const login = await loginRequest(email, password)
  if (!login.ok) {
    // Only a 401 means the credentials were wrong. Blaming the password for a rate limit or a
    // server outage sends people off resetting a password that was never the problem.
    if (login.status === 401) {
      return NextResponse.json({ error: "Invalid email or password." }, { status: 401 })
    }
    if (login.status === 429) {
      return NextResponse.json(
        { error: "Too many sign-in attempts. Please wait a minute and try again." },
        { status: 429 },
      )
    }
    return NextResponse.json(
      { error: "We couldn't sign you in right now. Please try again in a moment." },
      { status: 503 },
    )
  }
  const { tokens } = login

  const payload = decodeAccessToken(tokens.accessToken)
  const actualPortal = portalForRole(payload.role)

  if (actualPortal !== portal) {
    // The backend already started a session for this login. End it rather than leave an
    // unused refresh token live.
    await logoutRequest(tokens.accessToken).catch(() => {})
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
