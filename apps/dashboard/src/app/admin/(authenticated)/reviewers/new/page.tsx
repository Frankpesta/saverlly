"use client"
import * as React from "react"
import Link from "next/link"
import { useForm, Controller } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { toast } from "sonner"
import { CopyIcon } from "lucide-react"
import { EntityFormCard, EntityFormHeader } from "@/components/dashboard/entity-form-page"
import { FormField, FormGrid, FormSection } from "@/components/dashboard/form-section"
import { Input } from "@/components/ui/input"
import { DateTimePicker } from "@/components/dashboard/date-time-picker"
import { Button, buttonVariants } from "@/components/ui/button"
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card"
import { useCreateReviewer } from "@/lib/api/hooks/use-reviewers"
import { ApiError } from "@/lib/api/client"

const schema = z.object({
  name: z.string().trim().min(1, "Enter a name").max(100),
  email: z.union([z.literal(""), z.email()]),
  expiresAt: z
    .string()
    .refine(
      (v) =>
        Number.isFinite(Date.parse(v)) &&
        Date.parse(v) > Date.now() &&
        Date.parse(v) <= Date.now() + 90 * 86400_000,
      "Choose a future date within 90 days",
    ),
  maxInstallations: z.number().int().min(1).max(20),
})
type Values = z.infer<typeof schema>
function defaultExpiry() {
  const date = new Date(Date.now() + 7 * 86400_000)
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset())
  return date.toISOString().slice(0, 16)
}
export default function NewReviewerPage() {
  const create = useCreateReviewer()
  const [created, setCreated] = React.useState<{ code: string; name: string } | null>(null)
  const {
    register,
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    mode: "onTouched",
    defaultValues: { name: "", email: "", expiresAt: defaultExpiry(), maxInstallations: 1 },
  })
  if (created)
    return (
      <div className="flex flex-col gap-6">
        <EntityFormHeader
          backHref="/admin/reviewers"
          backLabel="Reviewers"
          heading="Reviewer invited"
          description={`Share this code with ${created.name}.`}
        />
        <Card className="max-w-2xl">
          <CardHeader>
            <CardTitle>Access code</CardTitle>
            <CardDescription>
              Copy it now. For security, the full code is only shown once.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <Input
              aria-label="Reviewer access code"
              readOnly
              value={created.code}
              className="font-mono"
            />
            <p className="text-sm text-muted-foreground">
              Ask them to install Saverlly from the Chrome Web Store, open the extension, and choose
              “Have a reviewer code?”
            </p>
          </CardContent>
          <CardFooter className="flex flex-wrap gap-2">
            <Button
              onClick={() =>
                navigator.clipboard
                  .writeText(created.code)
                  .then(() => toast.success("Code copied."))
                  .catch(() => toast.error("Could not copy. Select and copy the code above."))
              }
            >
              <CopyIcon className="size-4" />
              Copy code
            </Button>
            <Link className={buttonVariants({ variant: "outline" })} href="/admin/reviewers">
              Back to reviewers
            </Link>
          </CardFooter>
        </Card>
      </div>
    )
  return (
    <form
      className="flex flex-col gap-6"
      noValidate
      onSubmit={handleSubmit((values) =>
        create.mutate(
          {
            ...values,
            email: values.email || undefined,
            expiresAt: new Date(values.expiresAt).toISOString(),
          },
          {
            onSuccess: setCreated,
            onError: (error) =>
              toast.error(error instanceof ApiError ? error.message : "Could not create reviewer."),
          },
        ),
      )}
    >
      <EntityFormHeader
        backHref="/admin/reviewers"
        backLabel="Reviewers"
        heading="New reviewer"
        description="Create a temporary access code for the extension."
      />
      <EntityFormCard
        cancelHref="/admin/reviewers"
        submitLabel="Create access code"
        pendingLabel="Creating…"
        isPending={create.isPending}
      >
        <FormSection label="Reviewer">
          <FormGrid>
            <FormField label="Name" htmlFor="reviewer-name" error={errors.name?.message}>
              <Input id="reviewer-name" autoComplete="name" {...register("name")} />
            </FormField>
            <FormField
              label="Email (optional)"
              htmlFor="reviewer-email"
              error={errors.email?.message}
            >
              <Input id="reviewer-email" type="email" autoComplete="email" {...register("email")} />
            </FormField>
          </FormGrid>
        </FormSection>
        <FormSection
          label="Access"
          description="The code and activated installations stop working at the expiry time. Enable reviewer access on the Reviewers page when you are ready."
        >
          <FormGrid>
            <FormField label="Expires" htmlFor="reviewer-expiry" error={errors.expiresAt?.message}>
              <Controller
                name="expiresAt"
                control={control}
                render={({ field }) => (
                  <DateTimePicker
                    id="reviewer-expiry"
                    value={field.value}
                    onChange={field.onChange}
                    aria-invalid={!!errors.expiresAt}
                  />
                )}
              />
            </FormField>
            <FormField
              label="Installation limit"
              htmlFor="reviewer-limit"
              error={errors.maxInstallations?.message}
            >
              <Input
                id="reviewer-limit"
                type="number"
                min={1}
                max={20}
                {...register("maxInstallations", { valueAsNumber: true })}
              />
            </FormField>
          </FormGrid>
        </FormSection>
      </EntityFormCard>
    </form>
  )
}
