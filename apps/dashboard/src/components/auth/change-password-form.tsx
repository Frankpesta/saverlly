"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { motion } from "motion/react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { AlertCircleIcon, ArrowRightIcon, KeyRoundIcon, Loader2Icon } from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { AuthShell } from "@/components/auth/auth-shell"
import { AuthField } from "@/components/auth/auth-field"
import { PasswordStrengthBar } from "@/components/dashboard/password-strength"
import { passwordMismatchIssue, passwordSchema, passwordsMatch } from "@/lib/validation/schemas"

const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Current password is required"),
    newPassword: passwordSchema,
    confirmNewPassword: z.string(),
  })
  .refine(
    passwordsMatch("newPassword", "confirmNewPassword"),
    passwordMismatchIssue("confirmNewPassword", "New passwords don't match."),
  )

type ChangePasswordFormValues = z.infer<typeof changePasswordSchema>

export function ChangePasswordForm({ homeUrl, tagline }: { homeUrl: string; tagline: string }) {
  const router = useRouter()
  const [error, setError] = React.useState<string | null>(null)
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<ChangePasswordFormValues>({
    resolver: zodResolver(changePasswordSchema),
    mode: "onTouched",
    reValidateMode: "onChange",
    defaultValues: { currentPassword: "", newPassword: "", confirmNewPassword: "" },
  })

  async function onSubmit(values: ChangePasswordFormValues) {
    setError(null)
    try {
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword: values.currentPassword, newPassword: values.newPassword }),
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
        <form className="flex flex-col gap-5" onSubmit={handleSubmit(onSubmit)} noValidate>
          {error && (
            <Alert variant="destructive">
              <AlertCircleIcon />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <AuthField
            id="current-password"
            label="Current password"
            type="password"
            autoComplete="current-password"
            icon={<KeyRoundIcon />}
            error={errors.currentPassword?.message}
            {...register("currentPassword")}
          />
          <div className="flex flex-col gap-2">
            <AuthField
              id="new-password"
              label="New password"
              type="password"
              autoComplete="new-password"
              icon={<KeyRoundIcon />}
              error={errors.newPassword?.message}
              {...register("newPassword")}
            />
            <PasswordStrengthBar password={watch("newPassword")} />
          </div>
          <AuthField
            id="confirm-new-password"
            label="Confirm new password"
            type="password"
            autoComplete="new-password"
            icon={<KeyRoundIcon />}
            error={errors.confirmNewPassword?.message}
            {...register("confirmNewPassword")}
          />
          <p className="-mt-2 text-xs text-muted-foreground">At least 8 characters, with a letter and a number.</p>
          <Button type="submit" disabled={isSubmitting} className="auth-submit mt-2 h-12">
            {isSubmitting && <Loader2Icon className="animate-spin" />}
            {isSubmitting ? "Saving…" : "Set new password"}
            {!isSubmitting && <ArrowRightIcon className="size-4" />}
          </Button>
        </form>
      </motion.div>
    </AuthShell>
  )
}
