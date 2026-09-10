"use client"

import * as React from "react"
import { useParams } from "next/navigation"
import { toast } from "sonner"
import { useForm, Controller } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { CopyIcon, UserPlusIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Combobox } from "@/components/ui/combobox"
import { EntityCreatedPanel, EntityFormCard, EntityFormHeader } from "@/components/dashboard/entity-form-page"
import { FormField, FormGrid, FormSection } from "@/components/dashboard/form-section"
import { useCreateKioskUser, type CreateKioskUserResult } from "@/lib/api/hooks/use-kiosk-users"
import { useKiosk } from "@/lib/api/hooks/use-kiosks"
import { ApiError } from "@/lib/api/client"
import { emailSchema, nameSchema } from "@/lib/validation/schemas"

const addKioskUserSchema = z.object({
  name: nameSchema,
  email: emailSchema,
  role: z.enum(["KIOSK_OWNER", "LOCATION_MANAGER"]),
})

type AddKioskUserFormValues = z.infer<typeof addKioskUserSchema>

export default function NewKioskUserPage() {
  const { id: kioskId } = useParams<{ id: string }>()
  const { data: kiosk } = useKiosk(kioskId)
  const createUser = useCreateKioskUser(kioskId)
  const [result, setResult] = React.useState<CreateKioskUserResult | null>(null)
  const backHref = `/admin/kiosks/${kioskId}`

  const {
    register,
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<AddKioskUserFormValues>({
    resolver: zodResolver(addKioskUserSchema),
    mode: "onTouched",
    reValidateMode: "onChange",
    defaultValues: { name: "", email: "", role: "KIOSK_OWNER" },
  })

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

  if (result) {
    return (
      <EntityCreatedPanel
        icon={<UserPlusIcon className="size-6" />}
        title={`${result.user.name || result.user.email} was added`}
        description={`We also emailed these credentials to ${result.user.email}. They'll be asked to set a new password the first time they sign in.`}
        doneHref={backHref}
        doneLabel="Back to kiosk"
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
        backHref={backHref}
        backLabel={kiosk?.name ?? "Kiosk"}
        heading="Add user"
        description="We'll generate a secure password and email it to them."
      />

      <EntityFormCard
        cancelHref={backHref}
        submitLabel="Add user"
        pendingLabel="Adding…"
        isPending={isSubmitting}
      >
        <FormSection>
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
        </FormSection>
      </EntityFormCard>
    </form>
  )
}
