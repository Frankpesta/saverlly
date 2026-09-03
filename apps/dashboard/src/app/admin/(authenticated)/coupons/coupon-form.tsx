"use client"

import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { useForm, Controller } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { cn } from "@/lib/utils"
import { Input } from "@/components/ui/input"
import { Combobox } from "@/components/ui/combobox"
import { DatePicker } from "@/components/dashboard/date-picker"
import { EntityFormCard, EntityFormHeader } from "@/components/dashboard/entity-form-page"
import { FormField, FormGrid, FormSection } from "@/components/dashboard/form-section"
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

export function CouponForm({
  coupon,
  merchants,
  lockedMerchantId,
  backHref,
  backLabel,
}: {
  /** Present when editing. */
  coupon?: Coupon
  /** Options for the merchant picker. Omit when `lockedMerchantId` is set. */
  merchants?: Merchant[]
  /** Locks the coupon to one merchant and hides the picker, for the flow started from a
   * merchant's own page. */
  lockedMerchantId?: string
  backHref: string
  backLabel: string
}) {
  const router = useRouter()
  const isEdit = !!coupon
  const createCoupon = useCreateCoupon()
  const updateCoupon = useUpdateCoupon(coupon?.id ?? "")

  const {
    register,
    control,
    handleSubmit,
    setError,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<CouponFormValues>({
    resolver: zodResolver(couponSchema),
    mode: "onTouched",
    reValidateMode: "onChange",
    defaultValues: {
      merchantId: lockedMerchantId ?? coupon?.merchantId ?? "",
      code: coupon?.code ?? "",
      description: coupon?.description ?? "",
      discountType: coupon?.discountType ?? "unknown",
      discountValue: coupon?.discountValue?.toString() ?? "",
      expiresAt: coupon?.expiresAt ? toDateInput(coupon.expiresAt) : "",
    },
  })

  const discountType = watch("discountType")

  function onSubmit(values: CouponFormValues) {
    if (!lockedMerchantId && !isEdit && !values.merchantId) {
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

    const onSuccess = (message: string) => () => {
      toast.success(message)
      router.push(backHref)
    }
    const onError = (verb: string) => (error: unknown) =>
      toast.error(error instanceof ApiError ? error.message : `Could not ${verb} coupon.`)

    if (isEdit) {
      updateCoupon.mutate(shared, {
        onSuccess: onSuccess(`${values.code} was updated.`),
        onError: onError("update"),
      })
    } else {
      createCoupon.mutate(
        { merchantId: values.merchantId, ...shared },
        { onSuccess: onSuccess(`${values.code} was added.`), onError: onError("add") },
      )
    }
  }

  const isPending = createCoupon.isPending || updateCoupon.isPending || isSubmitting

  return (
    <form className="flex flex-col gap-6" onSubmit={handleSubmit(onSubmit)} noValidate>
      <EntityFormHeader
        backHref={backHref}
        backLabel={backLabel}
        heading={isEdit ? `Edit ${coupon.code}` : "New coupon"}
        description={
          isEdit ? "Update this coupon's details." : "Manually add a coupon code for a merchant."
        }
      />

      <EntityFormCard
        cancelHref={backHref}
        submitLabel={isEdit ? "Save changes" : "Add coupon"}
        pendingLabel="Saving…"
        isPending={isPending}
      >
        <FormSection label="Coupon">
          {!lockedMerchantId && !isEdit && (
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
        </FormSection>

        <FormSection label="Discount">
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
        </FormSection>
      </EntityFormCard>
    </form>
  )
}
