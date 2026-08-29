import type { Metadata } from "next"
import { ForgotPasswordForm } from "@/components/auth/forgot-password-form"

export const metadata: Metadata = { title: "Forgot password" }

export default function PortalForgotPasswordPage() {
  return (
    <ForgotPasswordForm
      portal="portal"
      tagline="Track your kiosk's earnings, coupons, and payouts."
    />
  )
}
