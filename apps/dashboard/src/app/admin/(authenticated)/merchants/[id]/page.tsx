"use client"

import * as React from "react"
import Link from "next/link"
import { useParams, useRouter } from "next/navigation"
import { toast } from "sonner"
import { ArrowLeftIcon } from "lucide-react"
import { useForm, Controller } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { Button } from "@/components/ui/button"
import { DeleteRowButton } from "@/components/dashboard/delete-row-button"
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import {
  useDeleteMerchant,
  useMerchant,
  useUpdateMerchant,
} from "@/lib/api/hooks/use-merchants"
import { ApiError } from "@/lib/api/client"
import type { Merchant } from "@/lib/api/types"
import { FormField, FormGrid } from "@/components/dashboard/form-section"
import { AttributionFields } from "../attribution-fields"
import { attributionFieldsSchema, nameSchema } from "@/lib/validation/schemas"
import { MerchantCouponsSection } from "./merchant-coupons-section"
import { MerchantScrapeSourcesSection } from "./merchant-scrape-sources-section"

const merchantEditSchema = z.object({
  name: nameSchema,
  domain: z.string().trim().min(1, "Domain is required"),
  active: z.boolean(),
  tracking: attributionFieldsSchema,
})

type MerchantEditFormValues = z.infer<typeof merchantEditSchema>

const checkoutRecipeSchema = z.object({
  couponFieldSelector: z.string().trim(),
  applyButtonSelector: z.string().trim(),
  successIndicatorSelector: z.string().trim(),
  failureIndicatorSelector: z.string().trim(),
  cartTotalSelector: z.string().trim(),
  checkoutUrlPatterns: z.string().transform((value) =>
    value
      .split(",")
      .map((p) => p.trim())
      .filter(Boolean),
  ),
})

type CheckoutRecipeFormInput = z.input<typeof checkoutRecipeSchema>
type CheckoutRecipeFormOutput = z.output<typeof checkoutRecipeSchema>

export default function MerchantDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const { data: merchant, isLoading, isError } = useMerchant(id)
  const deleteMerchant = useDeleteMerchant()

  function handleDelete() {
    deleteMerchant.mutate(id, {
      onSuccess: () => {
        toast.success("Merchant deleted.")
        router.push("/admin/merchants")
      },
      onError: (error) =>
        toast.error(error instanceof ApiError ? error.message : "Could not delete merchant."),
    })
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 border-b border-black/[0.09] dark:border-white/10 pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col gap-3">
          <Link
            href="/admin/merchants"
            className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeftIcon className="size-4" />
            Merchants
          </Link>
          <div>
            <p className="text-xs font-semibold tracking-[0.08em] text-muted-foreground uppercase">Merchant profile</p>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight">{merchant?.name ?? "Merchant"}</h2>
            {merchant && <p className="mt-1 text-sm text-muted-foreground">{merchant.domain}</p>}
          </div>
        </div>
        {merchant && (
          <DeleteRowButton
            variant="button"
            itemLabel={merchant.name}
            description="Its coupons and scrape sources will also stop being usable. This can't be undone."
            onConfirm={handleDelete}
            isPending={deleteMerchant.isPending}
          />
        )}
      </div>

      {isError && <p className="text-sm text-destructive">Could not load this merchant.</p>}
      {isLoading && <Skeleton className="h-64 w-full max-w-2xl" />}

      {merchant && (
        <div className="grid grid-cols-1 items-start gap-10 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
          <MerchantEditForm key={merchant.id} merchant={merchant} />
          <CheckoutRecipeForm key={`${merchant.id}-recipe`} merchant={merchant} />
          <MerchantCouponsSection merchantId={merchant.id} />
          <MerchantScrapeSourcesSection merchantId={merchant.id} />
        </div>
      )}
    </div>
  )
}

function MerchantEditForm({ merchant }: { merchant: Merchant }) {
  const updateMerchant = useUpdateMerchant(merchant.id)
  const {
    register,
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<MerchantEditFormValues>({
    resolver: zodResolver(merchantEditSchema),
    mode: "onTouched",
    reValidateMode: "onChange",
    defaultValues: {
      name: merchant.name,
      domain: merchant.domain,
      active: merchant.active,
      tracking: {
        attributionMethod: merchant.attributionMethod,
        affiliateTrackingUrl: merchant.affiliateTrackingUrl ?? "",
        affiliateUrlParamKey: merchant.affiliateUrlParamKey ?? "",
        affiliateUrlParamValue: merchant.affiliateUrlParamValue ?? "",
      },
    },
  })

  function onSubmit(values: MerchantEditFormValues) {
    updateMerchant.mutate(
      {
        name: values.name,
        domain: values.domain,
        active: values.active,
        attributionMethod: values.tracking.attributionMethod,
        affiliateTrackingUrl: values.tracking.affiliateTrackingUrl || undefined,
        affiliateUrlParamKey: values.tracking.affiliateUrlParamKey || undefined,
        affiliateUrlParamValue: values.tracking.affiliateUrlParamValue || undefined,
      },
      {
        onSuccess: () => toast.success("Merchant updated."),
        onError: (error) =>
          toast.error(error instanceof ApiError ? error.message : "Could not update merchant."),
      },
    )
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>{merchant.name}</CardTitle>
        <Controller
          name="active"
          control={control}
          render={({ field }) => (
            <div className="flex items-center gap-2">
              <Switch checked={field.value} onCheckedChange={field.onChange} aria-label="Toggle merchant active" />
              <Label className="text-sm text-muted-foreground">{field.value ? "Active" : "Inactive"}</Label>
            </div>
          )}
        />
      </CardHeader>
      <form onSubmit={handleSubmit(onSubmit)} noValidate>
        <CardContent className="flex flex-col gap-4">
          <FormGrid>
            <FormField label="Name" htmlFor="merchant-name" error={errors.name?.message}>
              <Input id="merchant-name" {...register("name")} />
            </FormField>
            <FormField label="Domain" htmlFor="merchant-domain" error={errors.domain?.message}>
              <Input id="merchant-domain" {...register("domain")} />
            </FormField>
          </FormGrid>
          <Controller
            name="tracking"
            control={control}
            render={({ field }) => (
              <AttributionFields
                idPrefix="merchant-edit"
                value={field.value}
                onChange={field.onChange}
                errors={{
                  affiliateTrackingUrl: errors.tracking?.affiliateTrackingUrl?.message,
                  affiliateUrlParamKey: errors.tracking?.affiliateUrlParamKey?.message,
                  affiliateUrlParamValue: errors.tracking?.affiliateUrlParamValue?.message,
                }}
              />
            )}
          />
        </CardContent>
        <CardFooter>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Saving…" : "Save changes"}
          </Button>
        </CardFooter>
      </form>
    </Card>
  )
}

function CheckoutRecipeForm({ merchant }: { merchant: Merchant }) {
  const updateMerchant = useUpdateMerchant(merchant.id)
  const recipe = merchant.checkoutRecipe
  const {
    register,
    handleSubmit,
    formState: { isSubmitting },
  } = useForm<CheckoutRecipeFormInput, unknown, CheckoutRecipeFormOutput>({
    resolver: zodResolver(checkoutRecipeSchema),
    mode: "onTouched",
    reValidateMode: "onChange",
    defaultValues: {
      couponFieldSelector: recipe?.couponFieldSelector ?? "",
      applyButtonSelector: recipe?.applyButtonSelector ?? "",
      successIndicatorSelector: recipe?.successIndicatorSelector ?? "",
      failureIndicatorSelector: recipe?.failureIndicatorSelector ?? "",
      cartTotalSelector: recipe?.cartTotalSelector ?? "",
      checkoutUrlPatterns: (recipe?.checkoutUrlPatterns ?? []).join(", "),
    },
  })

  function onSubmit(values: CheckoutRecipeFormOutput) {
    updateMerchant.mutate(
      {
        checkoutRecipe: {
          couponFieldSelector: values.couponFieldSelector || undefined,
          applyButtonSelector: values.applyButtonSelector || undefined,
          successIndicatorSelector: values.successIndicatorSelector || undefined,
          failureIndicatorSelector: values.failureIndicatorSelector || undefined,
          cartTotalSelector: values.cartTotalSelector || undefined,
          checkoutUrlPatterns: values.checkoutUrlPatterns.length > 0 ? values.checkoutUrlPatterns : undefined,
        },
      },
      {
        onSuccess: () => toast.success("Checkout recipe saved."),
        onError: (error) =>
          toast.error(error instanceof ApiError ? error.message : "Could not save checkout recipe."),
      },
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Checkout recipe</CardTitle>
      </CardHeader>
      <form onSubmit={handleSubmit(onSubmit)} noValidate>
        <CardContent className="flex flex-col gap-4">
          <FormGrid>
            <FormField label="Coupon field selector" htmlFor="recipe-coupon-field">
              <Input
                id="recipe-coupon-field"
                placeholder="input[name='promoCode']"
                {...register("couponFieldSelector")}
              />
            </FormField>
            <FormField label="Apply button selector" htmlFor="recipe-apply-button">
              <Input
                id="recipe-apply-button"
                placeholder="button[data-testid='apply-promo']"
                {...register("applyButtonSelector")}
              />
            </FormField>
          </FormGrid>
          <FormGrid>
            <FormField label="Success indicator selector" htmlFor="recipe-success">
              <Input
                id="recipe-success"
                placeholder=".promo-success-message"
                {...register("successIndicatorSelector")}
              />
            </FormField>
            <FormField label="Failure indicator selector" htmlFor="recipe-failure">
              <Input
                id="recipe-failure"
                placeholder=".promo-error-message"
                {...register("failureIndicatorSelector")}
              />
            </FormField>
          </FormGrid>
          <FormField label="Cart total selector" htmlFor="recipe-cart-total">
            <Input id="recipe-cart-total" placeholder=".order-summary-total" {...register("cartTotalSelector")} />
          </FormField>
          <FormField
            label="Checkout URL patterns"
            htmlFor="recipe-url-patterns"
            hint="Comma-separated."
          >
            <Input
              id="recipe-url-patterns"
              placeholder="/checkout, /cart/checkout"
              {...register("checkoutUrlPatterns")}
            />
          </FormField>
        </CardContent>
        <CardFooter>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Saving…" : "Save recipe"}
          </Button>
        </CardFooter>
      </form>
    </Card>
  )
}
