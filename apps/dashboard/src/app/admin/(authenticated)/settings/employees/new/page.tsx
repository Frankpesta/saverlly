"use client"

import * as React from "react"
import { toast } from "sonner"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { CopyIcon, UserPlusIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { EntityCreatedPanel, EntityFormCard, EntityFormHeader } from "@/components/dashboard/entity-form-page"
import { FormField, FormGrid, FormSection } from "@/components/dashboard/form-section"
import { useCreateAdminUser, type CreateAdminUserResult } from "@/lib/api/hooks/use-admin-users"
import { ApiError } from "@/lib/api/client"
import { emailSchema, nameSchema } from "@/lib/validation/schemas"

const addAdminUserSchema = z.object({
  name: nameSchema,
  email: emailSchema,
})

type AddAdminUserFormValues = z.infer<typeof addAdminUserSchema>

const BACK_HREF = "/admin/settings"

export default function NewAdminEmployeePage() {
  const createAdmin = useCreateAdminUser()
  const [result, setResult] = React.useState<CreateAdminUserResult | null>(null)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<AddAdminUserFormValues>({
    resolver: zodResolver(addAdminUserSchema),
    mode: "onTouched",
    reValidateMode: "onChange",
    defaultValues: { name: "", email: "" },
  })

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

  if (result) {
    return (
      <EntityCreatedPanel
        icon={<UserPlusIcon className="size-6" />}
        title={`${result.user.name || result.user.email} was added`}
        description={`Share these credentials with ${result.user.email}. They'll be asked to set a new password the first time they sign in.`}
        doneHref={BACK_HREF}
        doneLabel="Back to settings"
      >
        <div className="flex flex-col gap-2 rounded-lg border border-black/8 px-4 py-3 text-left dark:border-white/10">
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
      </EntityCreatedPanel>
    )
  }

  return (
    <form className="flex flex-col gap-6" onSubmit={handleSubmit(onSubmit)} noValidate>
      <EntityFormHeader
        backHref={BACK_HREF}
        backLabel="Settings"
        heading="Add employee"
        description="Admin-level access to this console. We'll generate a secure password for them."
      />

      <EntityFormCard
        cancelHref={BACK_HREF}
        submitLabel="Add employee"
        pendingLabel="Adding…"
        isPending={isSubmitting}
      >
        <FormSection>
          <FormGrid>
            <FormField label="Name" htmlFor="add-admin-name" error={errors.name?.message}>
              <Input id="add-admin-name" {...register("name")} />
            </FormField>
            <FormField label="Email" htmlFor="add-admin-email" error={errors.email?.message}>
              <Input id="add-admin-email" type="email" {...register("email")} />
            </FormField>
          </FormGrid>
        </FormSection>
      </EntityFormCard>
    </form>
  )
}
