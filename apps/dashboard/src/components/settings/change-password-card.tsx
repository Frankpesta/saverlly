"use client"

import * as React from "react"
import { toast } from "sonner"
import { Loader2Icon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { FormField } from "@/components/dashboard/form-section"

export function ChangePasswordCard() {
  const [currentPassword, setCurrentPassword] = React.useState("")
  const [newPassword, setNewPassword] = React.useState("")
  const [confirmNewPassword, setConfirmNewPassword] = React.useState("")
  const [submitting, setSubmitting] = React.useState(false)

  function reset() {
    setCurrentPassword("")
    setNewPassword("")
    setConfirmNewPassword("")
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()

    if (newPassword !== confirmNewPassword) {
      toast.error("New passwords don't match.")
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
        toast.error(data.error ?? "Could not change password.")
        return
      }

      toast.success("Password updated.")
      reset()
    } catch {
      toast.error("Could not reach the server. Please try again.")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Password</CardTitle>
        <CardDescription>Update the password you use to sign in.</CardDescription>
      </CardHeader>
      <CardContent>
        <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
          <FormField label="Current password" htmlFor="settings-current-password">
            <Input
              id="settings-current-password"
              type="password"
              autoComplete="current-password"
              required
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
            />
          </FormField>
          <FormField label="New password" htmlFor="settings-new-password" hint="At least 8 characters.">
            <Input
              id="settings-new-password"
              type="password"
              autoComplete="new-password"
              minLength={8}
              required
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
            />
          </FormField>
          <FormField label="Confirm new password" htmlFor="settings-confirm-new-password">
            <Input
              id="settings-confirm-new-password"
              type="password"
              autoComplete="new-password"
              minLength={8}
              required
              value={confirmNewPassword}
              onChange={(e) => setConfirmNewPassword(e.target.value)}
            />
          </FormField>
          <Button type="submit" disabled={submitting} className="mt-1 w-fit">
            {submitting && <Loader2Icon className="animate-spin" />}
            {submitting ? "Updating…" : "Update password"}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
