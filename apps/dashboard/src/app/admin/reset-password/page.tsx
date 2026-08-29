import type { Metadata } from "next"
import { Suspense } from "react"
import { ResetPasswordForm } from "@/components/auth/reset-password-form"

export const metadata: Metadata = { title: "Reset password" }

export default function AdminResetPasswordPage() {
  return (
    <Suspense>
      <ResetPasswordForm
        portal="admin"
        tagline="Manage every kiosk, merchant, and payout from one place."
      />
    </Suspense>
  )
}
