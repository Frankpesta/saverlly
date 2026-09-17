import { AttributionMethod, type PublicMerchant } from "@saverlly/shared-types";
import { mintAttributionSubId } from "./api-client";
import { appendAttributionLog } from "./storage";
import { appendUrlParam, urlHasParam } from "./url-param";
import { KNOWN_AFFILIATE_COOKIE_NAME_PATTERNS } from "./affiliate-network-signals";

function usesCookie(method: AttributionMethod): boolean {
  return (
    method === AttributionMethod.COOKIE || method === AttributionMethod.BOTH
  );
}

function usesUrlParam(method: AttributionMethod): boolean {
  return (
    method === AttributionMethod.URL_PARAM || method === AttributionMethod.BOTH
  );
}

// Bounded so a stalled tracking request can't hold up navigation. This is a best-effort
// ping, not something the checkout flow should ever wait long on.
const TRACKING_FETCH_TIMEOUT_MS = 5_000;

/**
 * Runs only after an explicit coupon-application action. Returns the URL the tab should be
 * redirected to if a URL param needed to be appended, otherwise null.
 */
export async function runAttribution(
  tabId: number,
  currentUrl: string,
  merchant: PublicMerchant,
  beforeRedirect?: (url: string) => Promise<void>,
): Promise<string | null> {
  const {
    id: merchantId,
    attributionMethod,
    affiliateTrackingUrl,
    affiliateUrlParamKey,
    affiliateUrlParamValue,
    affiliateSubIdParamKey,
  } = merchant;
  const attributionKey = `attributed:${tabId}:${merchantId}`;
  const previous = await chrome.storage?.session?.get(attributionKey);
  if (
    previous?.[attributionKey] &&
    Date.now() - previous[attributionKey] < 30 * 60_000
  )
    return null;
  const beforeCookies =
    (await chrome.cookies?.getAll({ domain: merchant.domain })) ?? [];

  // Sub-ID/click-ID pass-through, for commission attribution back to this device (Phase 5)
  //. Only for merchants whose network supports one. Minted server-side and logged as an
  // AttributionAttempt so a later-reported conversion can be matched back to this device.
  let subId: string | null = null;
  if (affiliateSubIdParamKey) {
    try {
      subId = await mintAttributionSubId(merchantId);
    } catch {
      // Best-effort, a failed mint shouldn't block the cookie/url-param tracking below.
    }
  }

  if (usesCookie(attributionMethod) && affiliateTrackingUrl) {
    const trackingUrl =
      subId && affiliateSubIdParamKey
        ? appendUrlParam(affiliateTrackingUrl, affiliateSubIdParamKey, subId)
        : affiliateTrackingUrl;
    // Fire-and-forget background request so the network's tracking cookie gets set
    // for this domain before checkout. No navigation, no visible effect to the user.
    try {
      await fetch(trackingUrl, {
        credentials: "include",
        mode: "no-cors",
        signal: AbortSignal.timeout(TRACKING_FETCH_TIMEOUT_MS),
      });
    } catch {
      // Best-effort, a failed or timed-out tracking ping shouldn't block URL-param attribution below.
    }
  }

  let redirectTo: string | null = null;
  if (
    usesUrlParam(attributionMethod) &&
    affiliateUrlParamKey &&
    affiliateUrlParamValue
  ) {
    if (
      new URL(currentUrl).searchParams.get(affiliateUrlParamKey) !==
      affiliateUrlParamValue
    ) {
      redirectTo = appendUrlParam(
        currentUrl,
        affiliateUrlParamKey,
        affiliateUrlParamValue,
      );
    }
    if (
      subId &&
      affiliateSubIdParamKey &&
      !urlHasParam(redirectTo ?? currentUrl, affiliateSubIdParamKey)
    ) {
      redirectTo = appendUrlParam(
        redirectTo ?? currentUrl,
        affiliateSubIdParamKey,
        subId,
      );
    }
  }

  await appendAttributionLog({
    domain: merchant.domain,
    merchantId: merchant.id,
    method: attributionMethod,
    timestamp: Date.now(),
  });

  if (redirectTo) {
    await beforeRedirect?.(redirectTo);
    await chrome.tabs.update(tabId, { url: redirectTo });
  }

  await chrome.storage?.session?.set({ [attributionKey]: Date.now() });
  const afterCookies =
    (await chrome.cookies?.getAll({ domain: merchant.domain })) ?? [];
  const owned = afterCookies
    .filter(
      (cookie) =>
        KNOWN_AFFILIATE_COOKIE_NAME_PATTERNS.some((pattern) =>
          pattern.test(cookie.name),
        ) &&
        !beforeCookies.some(
          (before) =>
            before.name === cookie.name && before.value === cookie.value,
        ),
    )
    .map(({ name, value }) => ({ name, value }));
  if (owned.length)
    await chrome.storage?.local?.set({
      [`ownedAffiliateCookies:${merchant.domain}`]: owned,
    });

  return redirectTo;
}
