"use client"

import * as React from "react"
import Link from "next/link"
import { useParams, useRouter } from "next/navigation"
import { toast } from "sonner"
import { ArrowLeftIcon, Trash2Icon } from "lucide-react"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
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
import type { CheckoutRecipe, Merchant } from "@/lib/api/types"
import { FormField, FormGrid } from "@/components/dashboard/form-section"
import { AttributionFields, type AttributionFieldsValue } from "../attribution-fields"
import { MerchantCouponsSection } from "./merchant-coupons-section"
import { MerchantScrapeSourcesSection } from "./merchant-scrape-sources-section"

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
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" size="sm" className="gap-1.5 text-destructive">
                <Trash2Icon className="size-4" />
                Delete
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete {merchant.name}?</AlertDialogTitle>
                <AlertDialogDescription>
                  Its coupons and scrape sources will also stop being usable. This can&apos;t be
                  undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleDelete}
                  className="bg-destructive text-white hover:bg-destructive/90"
                >
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
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
  const [name, setName] = React.useState(merchant.name)
  const [domain, setDomain] = React.useState(merchant.domain)
  const [active, setActive] = React.useState(merchant.active)
  const [tracking, setTracking] = React.useState<AttributionFieldsValue>({
    attributionMethod: merchant.attributionMethod,
    affiliateTrackingUrl: merchant.affiliateTrackingUrl ?? "",
    affiliateUrlParamKey: merchant.affiliateUrlParamKey ?? "",
    affiliateUrlParamValue: merchant.affiliateUrlParamValue ?? "",
  })

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    updateMerchant.mutate(
      {
        name,
        domain,
        active,
        attributionMethod: tracking.attributionMethod,
        affiliateTrackingUrl: tracking.affiliateTrackingUrl || undefined,
        affiliateUrlParamKey: tracking.affiliateUrlParamKey || undefined,
        affiliateUrlParamValue: tracking.affiliateUrlParamValue || undefined,
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
        <div className="flex items-center gap-2">
          <Switch checked={active} onCheckedChange={setActive} aria-label="Toggle merchant active" />
          <Label className="text-sm text-muted-foreground">{active ? "Active" : "Inactive"}</Label>
        </div>
      </CardHeader>
      <form onSubmit={handleSubmit}>
        <CardContent className="flex flex-col gap-4">
          <FormGrid>
            <FormField label="Name" htmlFor="merchant-name">
              <Input id="merchant-name" value={name} onChange={(e) => setName(e.target.value)} required />
            </FormField>
            <FormField label="Domain" htmlFor="merchant-domain">
              <Input
                id="merchant-domain"
                value={domain}
                onChange={(e) => setDomain(e.target.value)}
                required
              />
            </FormField>
          </FormGrid>
          <AttributionFields idPrefix="merchant-edit" value={tracking} onChange={setTracking} />
        </CardContent>
        <CardFooter>
          <Button type="submit" disabled={updateMerchant.isPending}>
            {updateMerchant.isPending ? "Saving…" : "Save changes"}
          </Button>
        </CardFooter>
      </form>
    </Card>
  )
}

function CheckoutRecipeForm({ merchant }: { merchant: Merchant }) {
  const updateMerchant = useUpdateMerchant(merchant.id)
  const recipe = merchant.checkoutRecipe
  const [couponFieldSelector, setCouponFieldSelector] = React.useState(recipe?.couponFieldSelector ?? "")
  const [applyButtonSelector, setApplyButtonSelector] = React.useState(recipe?.applyButtonSelector ?? "")
  const [successIndicatorSelector, setSuccessIndicatorSelector] = React.useState(
    recipe?.successIndicatorSelector ?? "",
  )
  const [failureIndicatorSelector, setFailureIndicatorSelector] = React.useState(
    recipe?.failureIndicatorSelector ?? "",
  )
  const [cartTotalSelector, setCartTotalSelector] = React.useState(recipe?.cartTotalSelector ?? "")
  const [checkoutUrlPatterns, setCheckoutUrlPatterns] = React.useState(
    (recipe?.checkoutUrlPatterns ?? []).join(", "),
  )

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    const patterns = checkoutUrlPatterns
      .split(",")
      .map((p) => p.trim())
      .filter(Boolean)

    const checkoutRecipe: CheckoutRecipe = {
      couponFieldSelector: couponFieldSelector || undefined,
      applyButtonSelector: applyButtonSelector || undefined,
      successIndicatorSelector: successIndicatorSelector || undefined,
      failureIndicatorSelector: failureIndicatorSelector || undefined,
      cartTotalSelector: cartTotalSelector || undefined,
      checkoutUrlPatterns: patterns.length > 0 ? patterns : undefined,
    }

    updateMerchant.mutate(
      { checkoutRecipe },
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
      <form onSubmit={handleSubmit}>
        <CardContent className="flex flex-col gap-4">
          <FormGrid>
            <FormField label="Coupon field selector" htmlFor="recipe-coupon-field">
              <Input
                id="recipe-coupon-field"
                placeholder="input[name='promoCode']"
                value={couponFieldSelector}
                onChange={(e) => setCouponFieldSelector(e.target.value)}
              />
            </FormField>
            <FormField label="Apply button selector" htmlFor="recipe-apply-button">
              <Input
                id="recipe-apply-button"
                placeholder="button[data-testid='apply-promo']"
                value={applyButtonSelector}
                onChange={(e) => setApplyButtonSelector(e.target.value)}
              />
            </FormField>
          </FormGrid>
          <FormGrid>
            <FormField label="Success indicator selector" htmlFor="recipe-success">
              <Input
                id="recipe-success"
                placeholder=".promo-success-message"
                value={successIndicatorSelector}
                onChange={(e) => setSuccessIndicatorSelector(e.target.value)}
              />
            </FormField>
            <FormField label="Failure indicator selector" htmlFor="recipe-failure">
              <Input
                id="recipe-failure"
                placeholder=".promo-error-message"
                value={failureIndicatorSelector}
                onChange={(e) => setFailureIndicatorSelector(e.target.value)}
              />
            </FormField>
          </FormGrid>
          <FormField label="Cart total selector" htmlFor="recipe-cart-total">
            <Input
              id="recipe-cart-total"
              placeholder=".order-summary-total"
              value={cartTotalSelector}
              onChange={(e) => setCartTotalSelector(e.target.value)}
            />
          </FormField>
          <FormField
            label="Checkout URL patterns"
            htmlFor="recipe-url-patterns"
            hint="Comma-separated."
          >
            <Input
              id="recipe-url-patterns"
              placeholder="/checkout, /cart/checkout"
              value={checkoutUrlPatterns}
              onChange={(e) => setCheckoutUrlPatterns(e.target.value)}
            />
          </FormField>
        </CardContent>
        <CardFooter>
          <Button type="submit" disabled={updateMerchant.isPending}>
            {updateMerchant.isPending ? "Saving…" : "Save recipe"}
          </Button>
        </CardFooter>
      </form>
    </Card>
  )
}
