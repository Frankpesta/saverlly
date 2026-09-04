"use client"

import { toast } from "sonner"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { FormField } from "@/components/dashboard/form-section"
import { SettingsSection } from "@/components/settings/settings-section"
import {
  usePlatformSettings,
  useUpdatePlatformSettings,
} from "@/lib/api/hooks/use-platform-settings"
import { ApiError } from "@/lib/api/client"

// Empty is allowed and means "no support address configured", which makes the portal render the
// text unlinked rather than pointing at nothing.
const platformSchema = z.object({
  supportEmail: z.union([z.literal(""), z.email("Enter a valid email address")]),
})

type PlatformFormValues = z.infer<typeof platformSchema>

/**
 * Settings that belong to the platform rather than to a person or a kiosk.
 *
 * The support address used to be `NEXT_PUBLIC_SUPPORT_EMAIL`, a build-time frontend variable, so
 * changing it meant editing a Vercel env var and redeploying. The client asked to change it from
 * the backend, so it is stored server-side and read at runtime now.
 */
export function PlatformSection() {
  const { data: settings, isLoading } = usePlatformSettings()
  const updateSettings = useUpdatePlatformSettings()

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<PlatformFormValues>({
    resolver: zodResolver(platformSchema),
    mode: "onTouched",
    reValidateMode: "onChange",
    values: { supportEmail: settings?.supportEmail ?? "" },
  })

  function onSubmit(values: PlatformFormValues) {
    updateSettings.mutate(values, {
      onSuccess: (updated) => {
        toast.success("Platform settings saved.")
        reset({ supportEmail: updated.supportEmail })
      },
      onError: (error) =>
        toast.error(error instanceof ApiError ? error.message : "Could not save settings."),
    })
  }

  return (
    <SettingsSection title="Platform">
      {isLoading ? (
        <Skeleton className="h-20 w-full max-w-md" />
      ) : (
        <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex max-w-md flex-col gap-4">
          <FormField
            label="Support email"
            htmlFor="support-email"
            hint="Kiosk owners and location managers are pointed here when they need help. Leave blank to show the text without a link."
            error={errors.supportEmail?.message}
          >
            <Input
              id="support-email"
              type="email"
              placeholder="support@saverlly.com"
              {...register("supportEmail")}
            />
          </FormField>
          <Button type="submit" className="w-fit" disabled={isSubmitting || !isDirty}>
            {isSubmitting ? "Saving…" : "Save"}
          </Button>
        </form>
      )}
    </SettingsSection>
  )
}
