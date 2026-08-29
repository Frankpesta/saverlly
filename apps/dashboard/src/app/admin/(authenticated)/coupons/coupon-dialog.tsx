"use client"

import * as React from "react"
import { toast } from "sonner"
import { PencilIcon, PlusIcon } from "lucide-react"
import { useForm, Controller } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { cn } from "@/lib/utils"
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
import { DatePicker } from "@/components/dashboard/date-picker"
import { FormField, FormGrid } from "@/components/dashboard/form-section"
import { useCreateCoupon, useUpdateCoupon } from "@/lib/api/hooks/use-coupons"
import { ApiError } from "@/lib/api/client"
import type { Coupon, CouponDiscountType, Merchant } from "@/lib/api/types"

const DISCOUNT_LABEL: Record<CouponDiscountType, string> = {
  percent: "Percent off",
  fixed: "Fixed amount off",
  unknown: "Unspecified",
}

const DISCOUNT_TYPES = ["percent", "fixed", "unknown"] as const

const couponSchema = z.object({
  merchantId: z.string(),
  code: z.string().trim().min(1, "Code is required"),
  description: z.string().trim(),
  discountType: z.enum(DISCOUNT_TYPES),
  discountValue: z
    .string()
    .trim()
    .refine((v) => v === "" || (!Number.isNaN(Number(v)) && Number(v) >= 0), "Enter a valid non-negative number"),
  expiresAt: z.string().trim(),
})

type CouponFormValues = z.infer<typeof couponSchema>

function toDateInput(iso: string): string {
  return iso.slice(0, 10)
}

/**
 * Create-or-edit coupon dialog. Pass `merchantId` when used inside a merchant's own page (locks
 * the merchant, hides the picker); pass `merchants` + omit `merchantId` for the cross-merchant
 * /admin/coupons list, where the picker is required. Pass `coupon` to edit instead of create.
 */
export function CouponDialog({
  merchantId,
  merchants,
  coupon,
}: {
  merchantId?: string
  merchants?: Merchant[]
  coupon?: Coupon
}) {
  const isEdit = !!coupon
  const [open, setOpen] = React.useState(false)

  const createCoupon = useCreateCoupon()
  const updateCoupon = useUpdateCoupon(coupon?.id ?? "")
  const isPending = createCoupon.isPending || updateCoupon.isPending

  const {
    register,
    control,
    handleSubmit,
    setError,
    reset: resetForm,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<CouponFormValues>({
    resolver: zodResolver(couponSchema),
    mode: "onTouched",
    reValidateMode: "onChange",
    defaultValues: {
      merchantId: merchantId ?? coupon?.merchantId ?? "",
      code: coupon?.code ?? "",
      description: coupon?.description ?? "",
      discountType: coupon?.discountType ?? "unknown",
      discountValue: coupon?.discountValue?.toString() ?? "",
      expiresAt: coupon?.expiresAt ? toDateInput(coupon.expiresAt) : "",
    },
  })

  const discountType = watch("discountType")

  function reset() {
    resetForm({
      merchantId: merchantId ?? "",
      code: "",
      description: "",
      discountType: "unknown",
      discountValue: "",
      expiresAt: "",
    })
  }

  function handleOpenChange(next: boolean) {
    setOpen(next)
    if (!next && !isEdit) reset()
  }

  function onSubmit(values: CouponFormValues) {
    if (!merchantId && !isEdit && !values.merchantId) {
      setError("merchantId", { message: "Choose a merchant for this coupon." })
      return
    }
    const shared = {
      code: values.code,
      description: values.description || undefined,
      discountType: values.discountType,
      discountValue: values.discountValue ? Number(values.discountValue) : undefined,
      expiresAt: values.expiresAt ? new Date(values.expiresAt).toISOString() : undefined,
    }

    if (isEdit) {
      updateCoupon.mutate(shared, {
        onSuccess: () => {
          toast.success(`${values.code} was updated.`)
          handleOpenChange(false)
        },
        onError: (error) =>
          toast.error(error instanceof ApiError ? error.message : "Could not update coupon."),
      })
    } else {
      createCoupon.mutate(
        { merchantId: values.merchantId, ...shared },
        {
          onSuccess: () => {
            toast.success(`${values.code} was added.`)
            handleOpenChange(false)
          },
          onError: (error) =>
            toast.error(error instanceof ApiError ? error.message : "Could not add coupon."),
        },
      )
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      {isEdit ? (
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={() => setOpen(true)}
          className="text-muted-foreground hover:text-foreground"
          aria-label={`Edit ${coupon?.code}`}
        >
          <PencilIcon className="size-3.5" />
        </Button>
      ) : (
        <Button onClick={() => setOpen(true)} className="gap-1.5">
          <PlusIcon className="size-4" />
          New Coupon
        </Button>
      )}
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit coupon" : "New coupon"}</DialogTitle>
          <DialogDescription>
            {isEdit ? "Update this coupon's details." : "Manually add a coupon code for a merchant."}
          </DialogDescription>
        </DialogHeader>

        <form className="flex flex-1 flex-col justify-between" onSubmit={handleSubmit(onSubmit)} noValidate>
          <div className="flex flex-col gap-4 px-6">
            {!merchantId && !isEdit && (
              <FormField label="Merchant" htmlFor="coupon-merchant" error={errors.merchantId?.message}>
                <Controller
                  name="merchantId"
                  control={control}
                  render={({ field, fieldState }) => (
                    <Combobox
                      id="coupon-merchant"
                      value={field.value}
                      onValueChange={field.onChange}
                      placeholder="Select a merchant"
                      searchPlaceholder="Search merchants..."
                      options={merchants?.map((merchant) => ({ value: merchant.id, label: merchant.name })) ?? []}
                      aria-invalid={!!fieldState.error}
                    />
                  )}
                />
              </FormField>
            )}
            <FormGrid>
              <FormField label="Code" htmlFor="coupon-code" error={errors.code?.message}>
                <Input id="coupon-code" {...register("code")} />
              </FormField>
              <FormField label="Description (optional)" htmlFor="coupon-description">
                <Input id="coupon-description" {...register("description")} />
              </FormField>
            </FormGrid>
            <FormGrid>
              <FormField label="Discount type" htmlFor="coupon-discount-type">
                <Controller
                  name="discountType"
                  control={control}
                  render={({ field }) => (
                    <Combobox
                      id="coupon-discount-type"
                      value={field.value}
                      onValueChange={field.onChange}
                      options={(Object.keys(DISCOUNT_LABEL) as CouponDiscountType[]).map((type) => ({
                        value: type,
                        label: DISCOUNT_LABEL[type],
                      }))}
                    />
                  )}
                />
              </FormField>
              <FormField label="Value (optional)" htmlFor="coupon-discount-value" error={errors.discountValue?.message}>
                <div className="relative">
                  {discountType === "fixed" && (
                    <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm text-muted-foreground">
                      $
                    </span>
                  )}
                  <Input
                    id="coupon-discount-value"
                    type="number"
                    min="0"
                    step="0.01"
                    {...register("discountValue")}
                    className={cn(
                      discountType === "fixed" && "pl-6",
                      discountType === "percent" && "pr-7",
                    )}
                  />
                  {discountType === "percent" && (
                    <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-sm text-muted-foreground">
                      %
                    </span>
                  )}
                </div>
              </FormField>
            </FormGrid>
            <FormField label="Expires (optional)" htmlFor="coupon-expires">
              <Controller
                name="expiresAt"
                control={control}
                render={({ field }) => <DatePicker id="coupon-expires" value={field.value} onChange={field.onChange} />}
              />
            </FormField>
          </div>

          <DialogFooter>
            <Button type="submit" disabled={isPending || isSubmitting}>
              {isPending || isSubmitting ? "Saving…" : isEdit ? "Save changes" : "Add coupon"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
