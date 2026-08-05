import { AttributionMethod, type PublicMerchant } from '@saverlly/shared-types';
import { appendAttributionLog } from './storage';
import { appendUrlParam, urlHasParam } from './url-param';

function usesCookie(method: AttributionMethod): boolean {
  return method === AttributionMethod.COOKIE || method === AttributionMethod.BOTH;
}

function usesUrlParam(method: AttributionMethod): boolean {
  return method === AttributionMethod.URL_PARAM || method === AttributionMethod.BOTH;
}

// Bounded so a stalled tracking request can't hold up navigation — this is a best-effort
// ping, not something the checkout flow should ever wait long on.
const TRACKING_FETCH_TIMEOUT_MS = 5_000;

/**
 * Fires attribution tracking for an active-merchant-domain visit. Runs independent of
 * coupon availability — a merchant with zero coupons still needs its tracking cookie/
 * param set so organic purchases generate commission. Returns the URL the tab should be
 * redirected to if a URL param needed to be appended, otherwise null.
 */
export async function runAttribution(tabId: number, currentUrl: string, merchant: PublicMerchant): Promise<string | null> {
  const { attributionMethod, affiliateTrackingUrl, affiliateUrlParamKey, affiliateUrlParamValue } = merchant;

  if (usesCookie(attributionMethod) && affiliateTrackingUrl) {
    // Fire-and-forget background request so the network's tracking cookie gets set
    // for this domain before checkout — no navigation, no visible effect to the user.
    try {
      await fetch(affiliateTrackingUrl, {
        credentials: 'include',
        mode: 'no-cors',
        signal: AbortSignal.timeout(TRACKING_FETCH_TIMEOUT_MS),
      });
    } catch {
      // Best-effort — a failed or timed-out tracking ping shouldn't block URL-param attribution below.
    }
  }

  let redirectTo: string | null = null;
  if (usesUrlParam(attributionMethod) && affiliateUrlParamKey && affiliateUrlParamValue) {
    if (!urlHasParam(currentUrl, affiliateUrlParamKey)) {
      redirectTo = appendUrlParam(currentUrl, affiliateUrlParamKey, affiliateUrlParamValue);
    }
  }

  await appendAttributionLog({
    domain: merchant.domain,
    merchantId: merchant.id,
    method: attributionMethod,
    timestamp: Date.now(),
  });

  if (redirectTo) {
    await chrome.tabs.update(tabId, { url: redirectTo });
  }

  return redirectTo;
}
