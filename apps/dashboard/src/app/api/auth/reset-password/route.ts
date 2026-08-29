import { NextResponse } from "next/server"
import { resetPasswordRequest } from "@/lib/auth/session"

export async function POST(request: Request) {
  const { token, newPassword } = (await request.json()) as {
    token?: string
    newPassword?: string
  }

  if (!token || !newPassword) {
    return NextResponse.json({ error: "Missing token or new password." }, { status: 400 })
  }

  const result = await resetPasswordRequest(token, newPassword)
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 401 })
  }
  return NextResponse.json({ success: true })
}
