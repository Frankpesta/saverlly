import type { Metadata } from "next"
import { LoginForm } from "@/components/auth/login-form"

export const metadata: Metadata = { title: "Kiosk Portal sign in" }

export default function PortalLoginPage() {
  return (
    <LoginForm
      portal="portal"
      title="Kiosk Portal"
      tagline="Track your kiosk's earnings, coupons, and payouts."
    />
  )
}
