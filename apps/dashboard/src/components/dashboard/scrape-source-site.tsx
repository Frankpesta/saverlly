import { couponSiteInfo } from "@saverlly/shared-types"
import { Badge } from "@/components/ui/badge"
import type { ScrapeSource } from "@/lib/api/types"

/** "SimplyCodes", "CouponFollow", or "Custom" for a source read with admin-written selectors. */
export function scrapeSiteLabel(source: Pick<ScrapeSource, "strategy">): string {
  return couponSiteInfo(source.strategy)?.label ?? "Custom"
}

/** What the coupon site said last time. Nothing is shown while it's reachable. */
export function ScrapeSourceStatusBadge({ source }: { source: Pick<ScrapeSource, "status"> }) {
  if (source.status === "NOT_LISTED")
    return (
      <Badge
        variant="secondary"
        title="This coupon site has no page for the store. Checked again monthly."
      >
        Not listed
      </Badge>
    )
  if (source.status === "BLOCKED")
    return (
      <Badge
        variant="destructive"
        title="The site's bot protection turned the scraper away on its last run."
      >
        Blocked
      </Badge>
    )
  return null
}
