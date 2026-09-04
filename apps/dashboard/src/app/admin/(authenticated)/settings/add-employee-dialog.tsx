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
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { FormField, FormGrid } from "@/components/dashboard/form-section"
import { useCreateAdminUser, type CreateAdminUserResult } from "@/lib/api/hooks/use-admin-users"
import { ApiError } from "@/lib/api/client"
import { emailSchema, nameSchema } from "@/lib/validation/schemas"

const addAdminUserSchema = z.object({
  name: nameSchema,
  email: emailSchema,
})

type AddAdminUserFormValues = z.infer<typeof addAdminUserSchema>

const emptyValues: AddAdminUserFormValues = { name: "", email: "" }

/** A large dialog rather than its own page. This used to be a dedicated route, but the whole
 * flow is two fields and a one-time credential reveal — small enough that navigating away from
 * the team list to get there and back was more ceremony than the task warranted. */
export function AddEmployeeDialog() {
  const [open, setOpen] = React.useState(false)
  const createAdmin = useCreateAdminUser()
  const [result, setResult] = React.useState<CreateAdminUserResult | null>(null)

  const {
    register,
    handleSubmit,
    reset: resetForm,
    formState: { errors, isSubmitting },
  } = useForm<AddAdminUserFormValues>({
    resolver: zodResolver(addAdminUserSchema),
    mode: "onTouched",
    reValidateMode: "onChange",
    defaultValues: emptyValues,
  })

  function handleOpenChange(next: boolean) {
    setOpen(next)
    if (!next) {
      // Deferred past the close animation so the credential panel doesn't visibly revert to the
      // empty form while the dialog is still fading out.
      setTimeout(() => {
        setResult(null)
        resetForm(emptyValues)
      }, 200)
    }
  }

  async function copyPassword(password: string) {
    try {
      await navigator.clipboard.writeText(password)
      toast.success("Password copied.")
    } catch {
      toast.error("Could not copy to clipboard.")
    }
  }

  function onSubmit(values: AddAdminUserFormValues) {
    createAdmin.mutate(values, {
      onSuccess: (data) => setResult(data),
      onError: (error) =>
        toast.error(error instanceof ApiError ? error.message : "Could not add employee."),
    })
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <Button
        type="button"
        variant="outline"
        className="w-full gap-1.5"
        onClick={() => setOpen(true)}
      >
        <UserPlusIcon className="size-4" />
        Add employee
      </Button>

      <DialogContent className="sm:max-w-3xl">
        {result ? (
          <>
            <DialogHeader>
              <div className="flex items-center gap-2 text-[var(--brand-teal)]">
                <UserPlusIcon className="size-5" />
                <DialogTitle>{result.user.name || result.user.email} was added</DialogTitle>
              </div>
              <DialogDescription>
                Share these credentials with {result.user.email}. They&apos;ll be asked to set a
                new password the first time they sign in.
              </DialogDescription>
            </DialogHeader>
            <div className="px-7 pb-1">
              <div className="flex flex-col gap-2 rounded-lg border border-black/8 px-4 py-3 dark:border-white/10">
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
            </div>
            <DialogFooter>
              <Button type="button" onClick={() => handleOpenChange(false)}>
                Done
              </Button>
            </DialogFooter>
          </>
        ) : (
          <form onSubmit={handleSubmit(onSubmit)} noValidate>
            <DialogHeader>
              <DialogTitle>Add employee</DialogTitle>
              <DialogDescription>
                Admin-level access to this console. We&apos;ll generate a secure password for
                them.
              </DialogDescription>
            </DialogHeader>
            <div className="px-7 py-5">
              <FormGrid>
                <FormField label="Name" htmlFor="add-admin-name" error={errors.name?.message}>
                  <Input id="add-admin-name" {...register("name")} />
                </FormField>
                <FormField label="Email" htmlFor="add-admin-email" error={errors.email?.message}>
                  <Input id="add-admin-email" type="email" {...register("email")} />
                </FormField>
              </FormGrid>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? "Adding…" : "Add employee"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
