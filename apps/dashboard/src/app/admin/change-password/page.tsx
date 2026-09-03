import type { Metadata } from "next"
import { ChangePasswordForm } from "@/components/auth/change-password-form"

export const metadata: Metadata = { title: "Set a new password" }

export default function AdminChangePasswordPage() {
  return (
    <ChangePasswordForm
      homeUrl="/admin/overview"
      tagline="Set a password only you know before you continue."
    />
  )
}
