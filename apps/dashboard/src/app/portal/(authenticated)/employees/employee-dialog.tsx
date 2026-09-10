"use client"

import * as React from "react"
import { toast } from "sonner"
import { useForm, Controller } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Combobox } from "@/components/ui/combobox"
import { FormField, FormGrid } from "@/components/dashboard/form-section"
import {
  useCreateLocationEmployee,
  useUpdateLocationEmployee,
} from "@/lib/api/hooks/use-location-employees"
import { ApiError } from "@/lib/api/client"
import { nameSchema } from "@/lib/validation/schemas"
import type { Location, LocationEmployeeWithLocation } from "@/lib/api/types"

const employeeSchema = z.object({
  locationId: z.string().min(1, "Select a location"),
  name: nameSchema,
  title: z.string().trim(),
  phone: z.string().trim(),
  // Blank is a legitimate value (no email on file yet), same convention as the platform support
  // email field -- only validate the shape when there's actually something to validate.
  email: z.union([z.literal(""), z.email("Enter a valid email address")]),
})

type EmployeeFormValues = z.infer<typeof employeeSchema>

function emptyValues(defaultLocationId: string): EmployeeFormValues {
  return { locationId: defaultLocationId, name: "", title: "", phone: "", email: "" }
}

function valuesFrom(employee: LocationEmployeeWithLocation): EmployeeFormValues {
  return {
    locationId: employee.locationId,
    name: employee.name,
    title: employee.title ?? "",
    phone: employee.phone ?? "",
    email: employee.email ?? "",
  }
}

/**
 * Add/edit dialog for one employee. A single component for both: editing is just this same form
 * pre-filled and pointed at an update mutation instead of a create one.
 *
 * The location is only editable when adding -- this page spans every location, so a new
 * employee needs to say where they are. An existing employee's location isn't reassignable here
 * (the backend doesn't support moving one between locations), so editing hides that field.
 */
export function EmployeeDialog({
  locations,
  employee,
  open,
  onOpenChange,
}: {
  locations: Location[]
  /** Present when editing; absent for "add new". */
  employee?: LocationEmployeeWithLocation
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const isEdit = !!employee
  const createEmployee = useCreateLocationEmployee()
  const updateEmployee = useUpdateLocationEmployee()

  const {
    register,
    control,
    handleSubmit,
    reset: resetForm,
    formState: { errors, isSubmitting },
  } = useForm<EmployeeFormValues>({
    resolver: zodResolver(employeeSchema),
    mode: "onTouched",
    reValidateMode: "onChange",
    defaultValues: employee ? valuesFrom(employee) : emptyValues(locations[0]?.id ?? ""),
  })

  // Re-seeds the form when a different row's edit button is clicked while this dialog instance
  // stays mounted, and clears it back to blank once closed after an add.
  React.useEffect(() => {
    if (open) resetForm(employee ? valuesFrom(employee) : emptyValues(locations[0]?.id ?? ""))
  }, [open, employee, locations, resetForm])

  function onSubmit(values: EmployeeFormValues) {
    const patch = {
      name: values.name,
      title: values.title || undefined,
      phone: values.phone || undefined,
      email: values.email || undefined,
    }
    const onSuccess = () => {
      toast.success(isEdit ? "Employee updated." : "Employee added.")
      onOpenChange(false)
    }
    const onError = (error: unknown) =>
      toast.error(
        error instanceof ApiError ? error.message : `Could not ${isEdit ? "update" : "add"} employee.`,
      )

    if (isEdit) {
      updateEmployee.mutate(
        { locationId: employee.locationId, id: employee.id, patch },
        { onSuccess, onError },
      )
    } else {
      createEmployee.mutate({ locationId: values.locationId, ...patch }, { onSuccess, onError })
    }
  }

  const isPending = createEmployee.isPending || updateEmployee.isPending || isSubmitting

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={handleSubmit(onSubmit)} noValidate>
          <DialogHeader>
            <DialogTitle>{isEdit ? "Edit employee" : "Add employee"}</DialogTitle>
            {/* <DialogDescription>
              {isEdit ? "Edit an on file for one of your locations" : "Add a contact on file for one of your locations."}
            </DialogDescription> */}
          </DialogHeader>
          <div className="flex flex-col gap-4 px-7 py-5">
            {!isEdit && (
              <FormField label="Location" htmlFor="emp-location" error={errors.locationId?.message}>
                <Controller
                  name="locationId"
                  control={control}
                  render={({ field, fieldState }) => (
                    <Combobox
                      id="emp-location"
                      value={field.value}
                      onValueChange={field.onChange}
                      placeholder="Select a location"
                      searchPlaceholder="Search locations..."
                      options={locations.map((location) => ({ value: location.id, label: location.name }))}
                      aria-invalid={!!fieldState.error}
                    />
                  )}
                />
              </FormField>
            )}
            <FormGrid>
              <FormField label="Name" htmlFor="emp-name" error={errors.name?.message}>
                <Input id="emp-name" {...register("name")} />
              </FormField>
              <FormField label="Title (optional)" htmlFor="emp-title">
                <Input id="emp-title" placeholder="Shift lead" {...register("title")} />
              </FormField>
            </FormGrid>
            <FormGrid>
              <FormField label="Phone (optional)" htmlFor="emp-phone">
                <Input id="emp-phone" type="tel" {...register("phone")} />
              </FormField>
              <FormField label="Email (optional)" htmlFor="emp-email" error={errors.email?.message}>
                <Input id="emp-email" type="email" {...register("email")} />
              </FormField>
            </FormGrid>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Saving…" : isEdit ? "Save changes" : "Add employee"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
