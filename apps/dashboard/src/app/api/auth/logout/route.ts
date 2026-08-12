import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { getAccessToken, logoutRequest } from "@/lib/auth/session"
import { clearSessionCookies } from "@/lib/auth/cookies"

export async function POST() {
  const accessToken = await getAccessToken()
  if (accessToken) {
    await logoutRequest(accessToken)
  }

  const cookieStore = await cookies()
  clearSessionCookies(cookieStore)

  return NextResponse.json({ ok: true })
}
