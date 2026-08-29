"use client"

import * as React from "react"
import { toast } from "sonner"
import { PencilIcon } from "lucide-react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useUpdateCurrentUser } from "@/lib/api/hooks/use-current-user"
import { ApiError } from "@/lib/api/client"
import { emailSchema, nameSchema } from "@/lib/validation/schemas"

const accountFieldSchema = z.object({
  name: nameSchema,
  email: emailSchema,
})

type AccountFieldFormValues = z.infer<typeof accountFieldSchema>

/** The Account section's name/email row — read-only display that switches to an inline
 * editable form on demand (`PATCH /users/me`; role/kiosk/managedLocationIds are deliberately
 * not self-service). */
export function AccountEmailField({
  name,
  email,
  roleLabel,
}: {
  name: string | null
  email: string
  roleLabel: string
}) {
  const [editing, setEditing] = React.useState(false)
  const updateMe = useUpdateCurrentUser()

  const {
    register,
    handleSubmit,
    reset: resetForm,
    formState: { errors, isSubmitting },
  } = useForm<AccountFieldFormValues>({
    resolver: zodResolver(accountFieldSchema),
    mode: "onTouched",
    reValidateMode: "onChange",
    defaultValues: { name: name ?? "", email },
  })

  function onSubmit(values: AccountFieldFormValues) {
    updateMe.mutate(values, {
      onSuccess: () => {
        toast.success("Account updated.")
        setEditing(false)
      },
      onError: (error) =>
        toast.error(error instanceof ApiError ? error.message : "Could not update account."),
    })
  }

  if (!editing) {
    return (
      <div className="flex items-center justify-between border-y border-black/[0.06] dark:border-white/10 py-3">
        <div className="flex flex-col">
          <span className="text-sm font-medium">{name || email}</span>
          {name && <span className="text-xs text-muted-foreground">{email}</span>}
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="secondary">{roleLabel}</Badge>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="text-muted-foreground hover:text-foreground"
            onClick={() => {
              resetForm({ name: name ?? "", email })
              setEditing(true)
            }}
            aria-label="Edit account"
          >
            <PencilIcon className="size-3.5" />
          </Button>
        </div>
      </div>
    )
  }

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      noValidate
      className="flex flex-col gap-2 border-y border-black/[0.06] dark:border-white/10 py-3"
    >
      <div className="flex flex-col gap-1">
        <Input placeholder="Name" autoFocus {...register("name")} aria-invalid={!!errors.name} />
        {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
      </div>
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <Input type="email" className="flex-1" {...register("email")} aria-invalid={!!errors.email} />
          <Button type="submit" size="sm" disabled={isSubmitting}>
            {isSubmitting ? "Saving…" : "Save"}
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => setEditing(false)}>
            Cancel
          </Button>
        </div>
        {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
      </div>
    </form>
  )
}
