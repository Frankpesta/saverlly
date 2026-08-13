"use client"

import * as React from "react"
import Link from "next/link"
import { motion } from "motion/react"
import { toast } from "sonner"
import { ShoppingBagIcon, CircleCheckIcon, LinkIcon } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { BentoGrid } from "@/components/dashboard/bento-grid"
import { StatTile } from "@/components/dashboard/stat-tile"
import { useMerchants, useUpdateMerchant } from "@/lib/api/hooks/use-merchants"
import { useCoupons } from "@/lib/api/hooks/use-coupons"
import { ApiError } from "@/lib/api/client"
import type { AttributionMethod } from "@/lib/api/types"
import { NewMerchantDialog } from "./new-merchant-dialog"

const METHOD_LABEL: Record<AttributionMethod, string> = {
  COOKIE: "Cookie",
  URL_PARAM: "URL param",
  BOTH: "Both",
}

export default function MerchantsPage() {
  const { data: merchants, isLoading, isError } = useMerchants()
  const { data: coupons } = useCoupons()

  const couponCountByMerchant = React.useMemo(() => {
    const counts = new Map<string, number>()
    for (const coupon of coupons ?? []) {
      counts.set(coupon.merchantId, (counts.get(coupon.merchantId) ?? 0) + 1)
    }
    return counts
  }, [coupons])

  const stats = React.useMemo(() => {
    const list = merchants ?? []
    return {
      total: list.length,
      active: list.filter((m) => m.active).length,
      withProgram: list.filter((m) => !!m.affiliateProgramId).length,
    }
  }, [merchants])

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Merchants</h2>
          <p className="text-sm text-muted-foreground">
            Every store tracked for commission, and how coupon codes get sourced for it.
          </p>
        </div>
        <NewMerchantDialog />
      </div>

      <BentoGrid>
        <StatTile label="Total merchants" value={stats.total} icon={<ShoppingBagIcon />} />
        <StatTile label="Active" value={stats.active} icon={<CircleCheckIcon />} />
        <StatTile label="With affiliate program" value={stats.withProgram} icon={<LinkIcon />} />
      </BentoGrid>

      {isError && <p className="text-sm text-destructive">Could not load merchants.</p>}

      <div className="overflow-hidden rounded-2xl border border-black/8">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Domain</TableHead>
              <TableHead>Tracking</TableHead>
              <TableHead>Coupons</TableHead>
              <TableHead>Active</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading &&
              Array.from({ length: 4 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell colSpan={6}>
                    <Skeleton className="h-6 w-full" />
                  </TableCell>
                </TableRow>
              ))}

            {!isLoading && merchants?.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground">
                  No merchants yet.
                </TableCell>
              </TableRow>
            )}

            {merchants?.map((merchant, index) => (
              <MerchantRow
                key={merchant.id}
                merchant={merchant}
                index={index}
                couponCount={couponCountByMerchant.get(merchant.id) ?? 0}
              />
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}

function MerchantRow({
  merchant,
  index,
  couponCount,
}: {
  merchant: NonNullable<ReturnType<typeof useMerchants>["data"]>[number]
  index: number
  couponCount: number
}) {
  const updateMerchant = useUpdateMerchant(merchant.id)

  function toggleActive() {
    updateMerchant.mutate(
      { active: !merchant.active },
      {
        onError: (error) =>
          toast.error(error instanceof ApiError ? error.message : "Could not update merchant."),
      },
    )
  }

  return (
    <motion.tr
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay: index * 0.03 }}
      className="border-b border-black/6 transition-colors last:border-0 hover:bg-[var(--brand-teal-tint)]/50"
    >
      <TableCell className="font-medium">
        <Link href={`/admin/merchants/${merchant.id}`} className="hover:underline">
          {merchant.name}
        </Link>
      </TableCell>
      <TableCell>{merchant.domain}</TableCell>
      <TableCell>
        <Badge variant="outline">{METHOD_LABEL[merchant.attributionMethod]}</Badge>
      </TableCell>
      <TableCell>{couponCount}</TableCell>
      <TableCell>
        <Switch
          checked={merchant.active}
          onCheckedChange={toggleActive}
          disabled={updateMerchant.isPending}
          aria-label={`Toggle ${merchant.name} active`}
        />
      </TableCell>
      <TableCell>
        <Link
          href={`/admin/merchants/${merchant.id}`}
          className="text-sm text-muted-foreground hover:underline"
        >
          Edit
        </Link>
      </TableCell>
    </motion.tr>
  )
}
