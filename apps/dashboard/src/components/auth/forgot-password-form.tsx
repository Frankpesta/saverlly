"use client"

import * as React from "react"
import Link from "next/link"
import { motion } from "motion/react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { ArrowLeftIcon, ArrowRightIcon, Loader2Icon, MailIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { AuthShell } from "@/components/auth/auth-shell"
import { AuthField } from "@/components/auth/auth-field"
import { emailSchema } from "@/lib/validation/schemas"

const forgotPasswordSchema = z.object({ email: emailSchema })
type ForgotPasswordFormValues = z.infer<typeof forgotPasswordSchema>

export function ForgotPasswordForm({
  portal,
  tagline,
}: {
  portal: "admin" | "portal"
  tagline: string
}) {
  const [sentTo, setSentTo] = React.useState<string | null>(null)
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ForgotPasswordFormValues>({
    resolver: zodResolver(forgotPasswordSchema),
    mode: "onTouched",
    reValidateMode: "onChange",
    defaultValues: { email: "" },
  })

  async function onSubmit(values: ForgotPasswordFormValues) {
    try {
      await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      })
    } finally {
      setSentTo(values.email)
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
          <h1 className="text-3xl font-semibold tracking-[-0.045em]">Forgot your password?</h1>
          <p className="text-sm leading-6 text-muted-foreground">
            Enter your email and we&apos;ll send you a reset link.
          </p>
        </div>

        {sentTo ? (
          <div className="flex flex-col gap-5">
            <p className="text-sm leading-6 text-foreground">
              If an account exists for <span className="font-medium">{sentTo}</span>, we sent a
              password reset link. Check your inbox.
            </p>
            <Link
              href={`/${portal}/login`}
              className="flex items-center gap-1.5 text-sm font-medium text-[var(--brand-teal)] hover:underline"
            >
              <ArrowLeftIcon className="size-4" />
              Back to sign in
            </Link>
          </div>
        ) : (
          <form className="flex flex-col gap-5" onSubmit={handleSubmit(onSubmit)} noValidate>
            <AuthField
              id="email"
              label="Email"
              type="email"
              autoComplete="email"
              icon={<MailIcon />}
              error={errors.email?.message}
              {...register("email")}
            />
            <Button type="submit" disabled={isSubmitting} className="auth-submit mt-2 h-12">
              {isSubmitting && <Loader2Icon className="animate-spin" />}
              {isSubmitting ? "Sending…" : "Send reset link"}
              {!isSubmitting && <ArrowRightIcon className="size-4" />}
            </Button>
            <Link
              href={`/${portal}/login`}
              className="flex items-center justify-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
            >
              <ArrowLeftIcon className="size-4" />
              Back to sign in
            </Link>
          </form>
        )}
      </motion.div>
    </AuthShell>
  )
}
