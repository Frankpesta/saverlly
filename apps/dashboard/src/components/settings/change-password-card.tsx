"use client"

import { toast } from "sonner"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { Loader2Icon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { PasswordInput } from "@/components/ui/password-input"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { FormField } from "@/components/dashboard/form-section"
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

export function ChangePasswordCard() {
  const {
    register,
    handleSubmit,
    watch,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ChangePasswordFormValues>({
    resolver: zodResolver(changePasswordSchema),
    mode: "onTouched",
    reValidateMode: "onChange",
    defaultValues: { currentPassword: "", newPassword: "", confirmNewPassword: "" },
  })

  async function onSubmit(values: ChangePasswordFormValues) {
    try {
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword: values.currentPassword, newPassword: values.newPassword }),
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
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Password</CardTitle>
        <CardDescription>Update the password you use to sign in.</CardDescription>
      </CardHeader>
      <CardContent>
        <form className="flex flex-col gap-4" onSubmit={handleSubmit(onSubmit)} noValidate>
          <FormField
            label="Current password"
            htmlFor="settings-current-password"
            error={errors.currentPassword?.message}
          >
            <PasswordInput
              id="settings-current-password"
              autoComplete="current-password"
              {...register("currentPassword")}
            />
          </FormField>
          <FormField
            label="New password"
            htmlFor="settings-new-password"
            hint="At least 8 characters, with a letter and a number."
            error={errors.newPassword?.message}
          >
            <PasswordInput
              id="settings-new-password"
              autoComplete="new-password"
              {...register("newPassword")}
            />
            <PasswordStrengthBar password={watch("newPassword")} />
          </FormField>
          <FormField
            label="Confirm new password"
            htmlFor="settings-confirm-new-password"
            error={errors.confirmNewPassword?.message}
          >
            <PasswordInput
              id="settings-confirm-new-password"
              autoComplete="new-password"
              {...register("confirmNewPassword")}
            />
          </FormField>
          <Button type="submit" disabled={isSubmitting} className="mt-1 w-fit">
            {isSubmitting && <Loader2Icon className="animate-spin" />}
            {isSubmitting ? "Updating…" : "Update password"}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
