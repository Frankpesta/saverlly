import type { Metadata } from "next"
import { Suspense } from "react"
import { ResetPasswordForm } from "@/components/auth/reset-password-form"

export const metadata: Metadata = { title: "Reset password" }

export default function PortalResetPasswordPage() {
  return (
    <Suspense>
      <ResetPasswordForm
        portal="portal"
        tagline="Track your kiosk's earnings, coupons, and payouts."
      />
    </Suspense>
  )
}
