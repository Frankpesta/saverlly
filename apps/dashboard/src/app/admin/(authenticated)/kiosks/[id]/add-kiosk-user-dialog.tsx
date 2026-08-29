"use client"

import * as React from "react"
import { toast } from "sonner"
import { useForm, Controller } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { CopyIcon, UserPlusIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Combobox } from "@/components/ui/combobox"
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

const addKioskUserSchema = z.object({
  name: nameSchema,
  email: emailSchema,
  role: z.enum(["KIOSK_OWNER", "LOCATION_MANAGER"]),
})

type AddKioskUserFormValues = z.infer<typeof addKioskUserSchema>

export function AddKioskUserDialog({ kioskId }: { kioskId: string }) {
  const [open, setOpen] = React.useState(false)
  const [result, setResult] = React.useState<CreateKioskUserResult | null>(null)
  const createUser = useCreateKioskUser(kioskId)

  const {
    register,
    control,
    handleSubmit,
    reset: resetForm,
    formState: { errors, isSubmitting },
  } = useForm<AddKioskUserFormValues>({
    resolver: zodResolver(addKioskUserSchema),
    mode: "onTouched",
    reValidateMode: "onChange",
    defaultValues: { name: "", email: "", role: "KIOSK_OWNER" },
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

  function onSubmit(values: AddKioskUserFormValues) {
    createUser.mutate(values, {
      onSuccess: (data) => setResult(data),
      onError: (error) =>
        toast.error(error instanceof ApiError ? error.message : "Could not add user."),
    })
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)} className="gap-1.5">
        <UserPlusIcon className="size-4" />
        Add user
      </Button>
      <DialogContent>
        {!result ? (
          <>
            <DialogHeader>
              <DialogTitle>Add user</DialogTitle>
              <DialogDescription>
                We&apos;ll generate a secure password and email it to them.
              </DialogDescription>
            </DialogHeader>

            <form className="flex flex-1 flex-col justify-between" onSubmit={handleSubmit(onSubmit)} noValidate>
              <div className="flex flex-col gap-4 px-6">
                <FormGrid>
                  <FormField label="Name" htmlFor="add-user-name" error={errors.name?.message}>
                    <Input id="add-user-name" {...register("name")} />
                  </FormField>
                  <FormField label="Email" htmlFor="add-user-email" error={errors.email?.message}>
                    <Input id="add-user-email" type="email" {...register("email")} />
                  </FormField>
                  <FormField label="Role" htmlFor="add-user-role" error={errors.role?.message}>
                    <Controller
                      name="role"
                      control={control}
                      render={({ field, fieldState }) => (
                        <Combobox
                          id="add-user-role"
                          value={field.value}
                          onValueChange={field.onChange}
                          options={[
                            { value: "KIOSK_OWNER", label: "Kiosk owner" },
                            { value: "LOCATION_MANAGER", label: "Location manager" },
                          ]}
                          aria-invalid={!!fieldState.error}
                        />
                      )}
                    />
                  </FormField>
                </FormGrid>
              </div>

              <DialogFooter>
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting ? "Adding…" : "Add user"}
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
