import type { Metadata } from "next"
import { ChangePasswordForm } from "@/components/auth/change-password-form"

export const metadata: Metadata = { title: "Set a new password" }

export default function PortalChangePasswordPage() {
  return <ChangePasswordForm homeUrl="/portal/overview" />
}
