"use client"

import * as React from "react"
import { toast } from "sonner"
import { PencilIcon, PlusIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import { useCreateCoupon, useUpdateCoupon } from "@/lib/api/hooks/use-coupons"
import { ApiError } from "@/lib/api/client"
import type { Coupon, CouponDiscountType, Merchant } from "@/lib/api/types"

const DISCOUNT_LABEL: Record<CouponDiscountType, string> = {
  percent: "Percent off",
  fixed: "Fixed amount off",
  unknown: "Unspecified",
}

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
  const [selectedMerchantId, setSelectedMerchantId] = React.useState(merchantId ?? coupon?.merchantId ?? "")
  const [code, setCode] = React.useState(coupon?.code ?? "")
  const [description, setDescription] = React.useState(coupon?.description ?? "")
  const [discountType, setDiscountType] = React.useState<CouponDiscountType>(coupon?.discountType ?? "unknown")
  const [discountValue, setDiscountValue] = React.useState(coupon?.discountValue?.toString() ?? "")
  const [expiresAt, setExpiresAt] = React.useState(coupon?.expiresAt ? toDateInput(coupon.expiresAt) : "")

  const createCoupon = useCreateCoupon()
  const updateCoupon = useUpdateCoupon(coupon?.id ?? "")
  const isPending = createCoupon.isPending || updateCoupon.isPending

  function reset() {
    setSelectedMerchantId(merchantId ?? "")
    setCode("")
    setDescription("")
    setDiscountType("unknown")
    setDiscountValue("")
    setExpiresAt("")
  }

  function handleOpenChange(next: boolean) {
    setOpen(next)
    if (!next && !isEdit) reset()
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    const shared = {
      code,
      description: description || undefined,
      discountType,
      discountValue: discountValue ? Number(discountValue) : undefined,
      expiresAt: expiresAt ? new Date(expiresAt).toISOString() : undefined,
    }

    if (isEdit) {
      updateCoupon.mutate(shared, {
        onSuccess: () => {
          toast.success(`${code} was updated.`)
          handleOpenChange(false)
        },
        onError: (error) =>
          toast.error(error instanceof ApiError ? error.message : "Could not update coupon."),
      })
    } else {
      createCoupon.mutate(
        { merchantId: selectedMerchantId, ...shared },
        {
          onSuccess: () => {
            toast.success(`${code} was added.`)
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
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex items-center gap-1 text-sm text-muted-foreground hover:underline"
        >
          <PencilIcon className="size-3.5" />
          Edit
        </button>
      ) : (
        <Button onClick={() => setOpen(true)} size="sm" className="gap-1.5">
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

        <form className="flex flex-1 flex-col justify-between" onSubmit={handleSubmit}>
          <div className="flex flex-col gap-4 px-4">
            {!merchantId && !isEdit && (
              <div className="flex flex-col gap-2">
                <Label htmlFor="coupon-merchant">Merchant</Label>
                <Select value={selectedMerchantId} onValueChange={setSelectedMerchantId} required>
                  <SelectTrigger id="coupon-merchant" className="w-full">
                    <SelectValue placeholder="Select a merchant" />
                  </SelectTrigger>
                  <SelectContent>
                    {merchants?.map((merchant) => (
                      <SelectItem key={merchant.id} value={merchant.id}>
                        {merchant.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="flex flex-col gap-2">
              <Label htmlFor="coupon-code">Code</Label>
              <Input id="coupon-code" value={code} onChange={(e) => setCode(e.target.value)} required />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="coupon-description">Description (optional)</Label>
              <Input
                id="coupon-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="coupon-discount-type">Discount type</Label>
                <Select value={discountType} onValueChange={(v) => setDiscountType(v as CouponDiscountType)}>
                  <SelectTrigger id="coupon-discount-type" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(DISCOUNT_LABEL) as CouponDiscountType[]).map((type) => (
                      <SelectItem key={type} value={type}>
                        {DISCOUNT_LABEL[type]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="coupon-discount-value">Value (optional)</Label>
                <Input
                  id="coupon-discount-value"
                  type="number"
                  min="0"
                  step="0.01"
                  value={discountValue}
                  onChange={(e) => setDiscountValue(e.target.value)}
                />
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="coupon-expires">Expires (optional)</Label>
              <Input
                id="coupon-expires"
                type="date"
                value={expiresAt}
                onChange={(e) => setExpiresAt(e.target.value)}
              />
            </div>
          </div>

          <DialogFooter>
            <Button type="submit" disabled={isPending || (!merchantId && !isEdit && !selectedMerchantId)}>
              {isPending ? "Saving…" : isEdit ? "Save changes" : "Add coupon"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
