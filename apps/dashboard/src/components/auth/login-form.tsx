"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { motion } from "motion/react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { AlertCircleIcon, ArrowRightIcon, Loader2Icon } from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { PasswordInput } from "@/components/ui/password-input"
import { FormField } from "@/components/dashboard/form-section"
import { AuthShell } from "@/components/auth/auth-shell"
import { emailSchema } from "@/lib/validation/schemas"

const loginSchema = z.object({
  email: emailSchema,
  // Not the full passwordSchema here — a login field shouldn't re-validate an existing
  // password against today's strength rules, only guard against submitting empty.
  password: z.string().min(1, "Password is required"),
})

type LoginFormValues = z.infer<typeof loginSchema>

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
  const [error, setError] = React.useState<string | null>(null)
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    mode: "onTouched",
    reValidateMode: "onChange",
    defaultValues: { email: "", password: "" },
  })

  async function onSubmit(values: LoginFormValues) {
    setError(null)

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...values, portal }),
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

        <form className="flex flex-col gap-5" onSubmit={handleSubmit(onSubmit)} noValidate>
          {error && (
            <Alert variant="destructive">
              <AlertCircleIcon />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <FormField label="Email" htmlFor="email" error={errors.email?.message}>
            <Input id="email" type="email" autoComplete="email" {...register("email")} />
          </FormField>
          <div className="flex flex-col gap-2">
            <FormField label="Password" htmlFor="password" error={errors.password?.message}>
              <PasswordInput id="password" autoComplete="current-password" {...register("password")} />
            </FormField>
            <Link
              href={`/${portal}/forgot-password`}
              className="self-end text-xs font-medium text-muted-foreground hover:text-foreground"
            >
              Forgot password?
            </Link>
          </div>
          <Button type="submit" disabled={isSubmitting} className="auth-submit mt-2 h-12">
            {isSubmitting && <Loader2Icon className="animate-spin" />}
            {isSubmitting ? "Signing in…" : "Sign in"}
            {!isSubmitting && <ArrowRightIcon className="size-4" />}
          </Button>
        </form>
      </motion.div>
    </AuthShell>
  )
}
