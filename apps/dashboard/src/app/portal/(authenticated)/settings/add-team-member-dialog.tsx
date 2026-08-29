"use client"

import * as React from "react"
import { toast } from "sonner"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { CopyIcon, UserPlusIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import { FormField, FormGrid } from "@/components/dashboard/form-section"
import { useCreateKioskUser, type CreateKioskUserResult } from "@/lib/api/hooks/use-kiosk-users"
import { ApiError } from "@/lib/api/client"
import { emailSchema, nameSchema } from "@/lib/validation/schemas"

const addTeamMemberSchema = z.object({
  name: nameSchema,
  email: emailSchema,
})

type AddTeamMemberFormValues = z.infer<typeof addTeamMemberSchema>

/**
 * A kiosk-owner may only create LOCATION_MANAGER accounts under their own kiosk (never a peer
 * owner — kiosk-users.service.ts's assertRoleAssignable enforces this server-side), so unlike
 * the admin equivalent this dialog has no role picker at all.
 */
export function AddTeamMemberDialog({ kioskId }: { kioskId: string }) {
  const [open, setOpen] = React.useState(false)
  const [result, setResult] = React.useState<CreateKioskUserResult | null>(null)
  const createUser = useCreateKioskUser(kioskId)

  const {
    register,
    handleSubmit,
    reset: resetForm,
    formState: { errors, isSubmitting },
  } = useForm<AddTeamMemberFormValues>({
    resolver: zodResolver(addTeamMemberSchema),
    mode: "onTouched",
    reValidateMode: "onChange",
    defaultValues: { name: "", email: "" },
  })

  function reset() {
    resetForm()
    setResult(null)
  }

  function handleOpenChange(next: boolean) {
    setOpen(next)
    if (!next) reset()
  }

  async function copyPassword(password: string) {
    try {
      await navigator.clipboard.writeText(password)
      toast.success("Password copied.")
    } catch {
      toast.error("Could not copy to clipboard.")
    }
  }

  function onSubmit(values: AddTeamMemberFormValues) {
    createUser.mutate(
      { ...values, role: "LOCATION_MANAGER" },
      {
        onSuccess: (data) => setResult(data),
        onError: (error) =>
          toast.error(error instanceof ApiError ? error.message : "Could not add team member."),
      },
    )
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)} className="gap-1.5">
        <UserPlusIcon className="size-4" />
        Add team member
      </Button>
      <DialogContent>
        {!result ? (
          <>
            <DialogHeader>
              <DialogTitle>Add team member</DialogTitle>
              <DialogDescription>
                We&apos;ll generate a secure password and email it to them. They&apos;ll be added
                as a location manager.
              </DialogDescription>
            </DialogHeader>

            <form className="flex flex-1 flex-col justify-between" onSubmit={handleSubmit(onSubmit)} noValidate>
              <div className="flex flex-col gap-4 px-6">
                <FormGrid>
                  <FormField label="Name" htmlFor="team-member-name" error={errors.name?.message}>
                    <Input id="team-member-name" {...register("name")} />
                  </FormField>
                  <FormField label="Email" htmlFor="team-member-email" error={errors.email?.message}>
                    <Input id="team-member-email" type="email" {...register("email")} />
                  </FormField>
                </FormGrid>
              </div>

              <DialogFooter>
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting ? "Adding…" : "Add team member"}
                </Button>
              </DialogFooter>
            </form>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Account created</DialogTitle>
              <DialogDescription>Share these credentials with {result.user.email}</DialogDescription>
            </DialogHeader>

            <div className="flex flex-col gap-4 px-6">
              <div className="flex flex-col gap-2 rounded-lg border border-black/8 px-4 py-3">
                <div>
                  <p className="text-sm text-muted-foreground">Name</p>
                  <p className="text-sm font-medium">{result.user.name}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Email</p>
                  <p className="text-sm font-medium">{result.user.email}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Temporary password</p>
                  <div className="flex items-center gap-2">
                    <code className="rounded-md bg-muted px-2 py-1 font-mono text-sm tracking-wider">
                      {result.generatedPassword}
                    </code>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => copyPassword(result.generatedPassword)}
                      aria-label="Copy password"
                    >
                      <CopyIcon className="size-3.5" />
                    </Button>
                  </div>
                </div>
              </div>
              <p className="text-sm text-muted-foreground">
                We also emailed this to {result.user.email}. They&apos;ll be asked to set a new
                password the first time they log in.
              </p>
            </div>

            <DialogFooter>
              <Button onClick={() => handleOpenChange(false)}>Done</Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
