"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { motion } from "motion/react"
import { AlertCircleIcon, ArrowRightIcon, KeyRoundIcon, Loader2Icon } from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { AuthShell } from "@/components/auth/auth-shell"
import { AuthField } from "@/components/auth/auth-field"

export function ChangePasswordForm({ homeUrl, tagline }: { homeUrl: string; tagline: string }) {
  const router = useRouter()
  const [currentPassword, setCurrentPassword] = React.useState("")
  const [newPassword, setNewPassword] = React.useState("")
  const [confirmNewPassword, setConfirmNewPassword] = React.useState("")
  const [error, setError] = React.useState<string | null>(null)
  const [submitting, setSubmitting] = React.useState(false)

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setError(null)

    if (newPassword !== confirmNewPassword) {
      setError("New passwords don't match.")
      return
    }

    setSubmitting(true)
    try {
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      })
      const data = await res.json()

      if (!res.ok) {
        setError(data.error ?? "Something went wrong. Please try again.")
        return
      }

      router.push(homeUrl)
      router.refresh()
    } catch {
      setError("Could not reach the server. Please try again.")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AuthShell tagline={tagline}>
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
        className="w-full max-w-sm"
      >
        <div className="mb-10 flex flex-col gap-2">
          <p className="text-xs font-semibold tracking-[0.12em] text-[var(--brand-teal)] uppercase">Secure your account</p>
          <h1 className="text-3xl font-semibold tracking-[-0.045em]">Set a new password</h1>
          <p className="text-sm leading-6 text-muted-foreground">You&apos;re using a temporary password. Create one only you know before continuing.</p>
        </div>
        <form className="flex flex-col gap-5" onSubmit={handleSubmit}>
              {error && (
                <Alert variant="destructive">
                  <AlertCircleIcon />
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
              <AuthField id="current-password" label="Current password" type="password" autoComplete="current-password" required value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} icon={<KeyRoundIcon />} />
              <AuthField id="new-password" label="New password" type="password" autoComplete="new-password" minLength={8} required value={newPassword} onChange={(e) => setNewPassword(e.target.value)} icon={<KeyRoundIcon />} />
              <AuthField id="confirm-new-password" label="Confirm new password" type="password" autoComplete="new-password" minLength={8} required value={confirmNewPassword} onChange={(e) => setConfirmNewPassword(e.target.value)} icon={<KeyRoundIcon />} />
              <p className="-mt-2 text-xs text-muted-foreground">Use at least 8 characters.</p>
              <Button type="submit" disabled={submitting} className="auth-submit mt-2 h-12">
                {submitting && <Loader2Icon className="animate-spin" />}
                {submitting ? "Saving…" : "Set new password"}
                {!submitting && <ArrowRightIcon className="size-4" />}
              </Button>
            </form>
      </motion.div>
    </AuthShell>
  )
}
