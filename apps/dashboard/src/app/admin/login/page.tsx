import type { Metadata } from "next"
import { LoginForm } from "@/components/auth/login-form"

export const metadata: Metadata = { title: "Admin sign in" }

export default function AdminLoginPage() {
  return (
    <LoginForm
      portal="admin"
      title="Admin Console"
      tagline="Manage every kiosk, merchant, and payout from one place."
    />
  )
}
