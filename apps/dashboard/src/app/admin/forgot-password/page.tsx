import type { Metadata } from "next"
import { ForgotPasswordForm } from "@/components/auth/forgot-password-form"

export const metadata: Metadata = { title: "Forgot password" }

export default function AdminForgotPasswordPage() {
  return (
    <ForgotPasswordForm
      portal="admin"
      tagline="Manage every kiosk, merchant, and payout from one place."
    />
  )
}
