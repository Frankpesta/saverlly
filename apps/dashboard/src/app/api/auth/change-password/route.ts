import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { backendFetch } from "@/lib/api/backend"
import { getAccessToken } from "@/lib/auth/session"
import { setSessionCookies } from "@/lib/auth/cookies"
import type { TokenPair } from "@/lib/api/types"

export async function POST(request: Request) {
  let body: { currentPassword?: string; newPassword?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Missing fields." }, { status: 400 })
  }

  const { currentPassword, newPassword } = body
  if (!currentPassword || !newPassword) {
    return NextResponse.json({ error: "Missing fields." }, { status: 400 })
  }

  const accessToken = await getAccessToken()
  if (!accessToken) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 })
  }

  const res = await backendFetch("/auth/change-password", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ currentPassword, newPassword }),
  })

  if (!res.ok) {
    let message = "Could not change password."
    try {
      const body = await res.json()
      if (typeof body?.message === "string") message = body.message
      else if (Array.isArray(body?.message)) message = body.message.join(", ")
    } catch {
      // response wasn't JSON, keep the default message
    }
    return NextResponse.json({ error: message }, { status: res.status })
  }

  // Issue fresh cookies immediately. The caller's old access token still carries
  // mustChangePassword: true and would otherwise keep redirecting them back here.
  const tokens: TokenPair = await res.json()
  const cookieStore = await cookies()
  setSessionCookies(cookieStore, tokens)

  return NextResponse.json({ success: true })
}
