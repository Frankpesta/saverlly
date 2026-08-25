"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { motion } from "motion/react"
import { AlertCircleIcon, ArrowRightIcon, Loader2Icon, LockIcon, MailIcon } from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { AuthShell } from "@/components/auth/auth-shell"
import { AuthField } from "@/components/auth/auth-field"

export function LoginForm({
  portal,
  title,
  tagline,
}: {
  portal: "admin" | "portal"
  title: string
  tagline: string
}) {
  const router = useRouter()
  const [email, setEmail] = React.useState("")
  const [password, setPassword] = React.useState("")
  const [error, setError] = React.useState<string | null>(null)
  const [submitting, setSubmitting] = React.useState(false)

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setSubmitting(true)
    setError(null)

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, portal }),
      })
      const data = await res.json()

      if (!res.ok) {
        setError(data.error ?? "Something went wrong. Please try again.")
        return
      }

      router.push(data.redirectTo)
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
          <p className="text-xs font-semibold tracking-[0.12em] text-[var(--brand-teal)] uppercase">Secure sign in</p>
          <h1 className="text-3xl font-semibold tracking-[-0.045em]">{title}</h1>
          <p className="text-sm leading-6 text-muted-foreground">Sign in to continue to your workspace.</p>
        </div>

        <form className="flex flex-col gap-5" onSubmit={handleSubmit}>
          {error && (
            <Alert variant="destructive">
              <AlertCircleIcon />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <AuthField id="email" label="Email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} icon={<MailIcon />} />
          <AuthField id="password" label="Password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} icon={<LockIcon />} />
          <Button type="submit" disabled={submitting} className="auth-submit mt-2 h-12">
            {submitting && <Loader2Icon className="animate-spin" />}
            {submitting ? "Signing in…" : "Sign in"}
            {!submitting && <ArrowRightIcon className="size-4" />}
          </Button>
        </form>
      </motion.div>
    </AuthShell>
  )
}
