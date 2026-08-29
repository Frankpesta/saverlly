"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { motion } from "motion/react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { AlertCircleIcon, ArrowRightIcon, Loader2Icon, LockIcon } from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { AuthShell } from "@/components/auth/auth-shell"
import { AuthField } from "@/components/auth/auth-field"
import { PasswordStrengthBar } from "@/components/dashboard/password-strength"
import { passwordMismatchIssue, passwordSchema, passwordsMatch } from "@/lib/validation/schemas"

const resetPasswordSchema = z
  .object({
    newPassword: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine(passwordsMatch("newPassword", "confirmPassword"), passwordMismatchIssue("confirmPassword"))

type ResetPasswordFormValues = z.infer<typeof resetPasswordSchema>

export function ResetPasswordForm({
  portal,
  tagline,
}: {
  portal: "admin" | "portal"
  tagline: string
}) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const token = searchParams.get("token") ?? ""
  const [error, setError] = React.useState<string | null>(null)
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<ResetPasswordFormValues>({
    resolver: zodResolver(resetPasswordSchema),
    mode: "onTouched",
    reValidateMode: "onChange",
    defaultValues: { newPassword: "", confirmPassword: "" },
  })

  async function onSubmit(values: ResetPasswordFormValues) {
    setError(null)

    if (!token) {
      setError("This reset link is missing its token — request a new one.")
      return
    }

    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, newPassword: values.newPassword }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? "Could not reset password.")
        return
      }
      router.push(`/${portal}/login`)
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
          <p className="text-xs font-semibold tracking-[0.12em] text-[var(--brand-teal)] uppercase">
            Reset password
          </p>
          <h1 className="text-3xl font-semibold tracking-[-0.045em]">Choose a new password</h1>
          <p className="text-sm leading-6 text-muted-foreground">
            Make it at least 8 characters, with a letter and a number.
          </p>
        </div>

        <form className="flex flex-col gap-5" onSubmit={handleSubmit(onSubmit)} noValidate>
          {error && (
            <Alert variant="destructive">
              <AlertCircleIcon />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <div className="flex flex-col gap-2">
            <AuthField
              id="password"
              label="New password"
              type="password"
              autoComplete="new-password"
              icon={<LockIcon />}
              error={errors.newPassword?.message}
              {...register("newPassword")}
            />
            <PasswordStrengthBar password={watch("newPassword")} />
          </div>
          <AuthField
            id="confirm"
            label="Confirm password"
            type="password"
            autoComplete="new-password"
            icon={<LockIcon />}
            error={errors.confirmPassword?.message}
            {...register("confirmPassword")}
          />
          <Button type="submit" disabled={isSubmitting} className="auth-submit mt-2 h-12">
            {isSubmitting && <Loader2Icon className="animate-spin" />}
            {isSubmitting ? "Resetting…" : "Reset password"}
            {!isSubmitting && <ArrowRightIcon className="size-4" />}
          </Button>
          <Link
            href={`/${portal}/login`}
            className="text-center text-sm text-muted-foreground hover:text-foreground"
          >
            Back to sign in
          </Link>
        </form>
      </motion.div>
    </AuthShell>
  )
}
