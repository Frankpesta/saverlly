import { NextResponse } from "next/server"
import { forgotPasswordRequest } from "@/lib/auth/session"

export async function POST(request: Request) {
  const { email } = (await request.json()) as { email?: string }

  if (!email) {
    return NextResponse.json({ error: "Email is required." }, { status: 400 })
  }

  await forgotPasswordRequest(email)
  return NextResponse.json({ success: true })
}
