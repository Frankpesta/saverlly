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
      <div className="flex items-center justify-between">
        <Link
          href="/admin/merchants"
          className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:underline"
        >
          <ArrowLeftIcon className="size-4" />
          Back to Merchants
        </Link>
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
        <div className="flex flex-wrap items-start gap-6">
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
    <Card className="w-full max-w-lg">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>{merchant.name}</CardTitle>
        <div className="flex items-center gap-2">
          <Switch checked={active} onCheckedChange={setActive} aria-label="Toggle merchant active" />
          <Label className="text-sm text-muted-foreground">{active ? "Active" : "Inactive"}</Label>
        </div>
      </CardHeader>
      <form onSubmit={handleSubmit}>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="merchant-name">Name</Label>
            <Input id="merchant-name" value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="merchant-domain">Domain</Label>
            <Input
              id="merchant-domain"
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              required
            />
          </div>
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
    <Card className="w-full max-w-lg">
      <CardHeader>
        <CardTitle>Checkout recipe</CardTitle>
      </CardHeader>
      <form onSubmit={handleSubmit}>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="recipe-coupon-field">Coupon field selector</Label>
            <Input
              id="recipe-coupon-field"
              placeholder="input[name='promoCode']"
              value={couponFieldSelector}
              onChange={(e) => setCouponFieldSelector(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="recipe-apply-button">Apply button selector</Label>
            <Input
              id="recipe-apply-button"
              placeholder="button[data-testid='apply-promo']"
              value={applyButtonSelector}
              onChange={(e) => setApplyButtonSelector(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="recipe-success">Success indicator selector</Label>
            <Input
              id="recipe-success"
              placeholder=".promo-success-message"
              value={successIndicatorSelector}
              onChange={(e) => setSuccessIndicatorSelector(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="recipe-failure">Failure indicator selector</Label>
            <Input
              id="recipe-failure"
              placeholder=".promo-error-message"
              value={failureIndicatorSelector}
              onChange={(e) => setFailureIndicatorSelector(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="recipe-cart-total">Cart total selector</Label>
            <Input
              id="recipe-cart-total"
              placeholder=".order-summary-total"
              value={cartTotalSelector}
              onChange={(e) => setCartTotalSelector(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="recipe-url-patterns">Checkout URL patterns</Label>
            <Input
              id="recipe-url-patterns"
              placeholder="/checkout, /cart/checkout"
              value={checkoutUrlPatterns}
              onChange={(e) => setCheckoutUrlPatterns(e.target.value)}
            />
            <p className="text-sm text-muted-foreground">Comma-separated.</p>
          </div>
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
