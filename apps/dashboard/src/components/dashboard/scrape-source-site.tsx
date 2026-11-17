import { couponSiteInfo, SCRAPE_SOURCE_FAILING_AFTER } from "@saverlly/shared-types"
import { Badge } from "@/components/ui/badge"
import type { ScrapeSource } from "@/lib/api/types"

/** "SimplyCodes", "CouponFollow", or "Custom" for a source read with admin-written selectors. */
export function scrapeSiteLabel(source: Pick<ScrapeSource, "strategy">): string {
  return couponSiteInfo(source.strategy)?.label ?? "Custom"
}

/** What the coupon site said last time, and whether the source keeps failing. Nothing is shown
 * while all is well. */
export function ScrapeSourceStatusBadge({
  source,
}: {
  source: Pick<ScrapeSource, "status"> & Partial<Pick<ScrapeSource, "consecutiveFailures">>
}) {
  if ((source.consecutiveFailures ?? 0) >= SCRAPE_SOURCE_FAILING_AFTER)
    return (
      <Badge
        variant="destructive"
        title={`The last ${source.consecutiveFailures} runs failed. Its last error is shown with the run.`}
      >
        Failing
      </Badge>
    )
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
        title="The site's bot protection turned the scraper away on its last run. It waits longer before each new try."
      >
        Blocked
      </Badge>
    )
  return null
}
