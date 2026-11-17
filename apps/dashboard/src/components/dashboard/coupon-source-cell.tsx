import { couponSiteInfo } from "@saverlly/shared-types"
import { Badge } from "@/components/ui/badge"
import type { Coupon } from "@/lib/api/types"

/** The coupon's source, plus which coupon sites list the code ("SimplyCodes · CouponFollow").
 * More sites agreeing on a code ranks it higher in the extension. */
export function CouponSourceCell({ coupon }: { coupon: Pick<Coupon, "source" | "sightings"> }) {
  const sites = (coupon.sightings ?? [])
    .map((sighting) => couponSiteInfo(sighting.strategy)?.label ?? "Custom page")
    .filter((label, index, all) => all.indexOf(label) === index)
  return (
    <div className="flex flex-col items-start gap-1">
      <Badge variant="outline">{coupon.source}</Badge>
      {sites.length > 0 && (
        <span className="text-xs text-muted-foreground" title="Coupon sites that list this code">
          {sites.join(" · ")}
        </span>
      )}
    </div>
  )
}
