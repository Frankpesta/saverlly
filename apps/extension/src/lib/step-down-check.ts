import {
  KNOWN_AFFILIATE_COOKIE_NAME_PATTERNS,
  KNOWN_AFFILIATE_URL_PARAM_PATTERNS,
} from "./affiliate-network-signals";

export interface StepDownCookie {
  name: string;
  value?: string;
}

function hasCompetingUrlParam(
  url: string,
  ownUrlParamKey?: string | null,
  ownValue?: string | null,
): boolean {
  try {
    const params = new URL(url).searchParams;
    return KNOWN_AFFILIATE_URL_PARAM_PATTERNS.some(
      (key) =>
        params.has(key) &&
        !(
          key === ownUrlParamKey &&
          ownValue != null &&
          params.get(key) === ownValue
        ),
    );
  } catch {
    return false;
  }
}

/**
 * Pure detection logic: does this cookie set, current URL, or referrer indicate a
 * competing affiliate's tracking is already active on this merchant? Excludes Saverlly's
 * own tracking param (ownUrlParamKey) so our own attribution never trips our own
 * step-down check.
 */
export function detectStepDown(
  cookies: StepDownCookie[],
  currentUrl: string,
  ownUrlParamKey?: string | null,
  referrer?: string | null,
  ownValue?: string | null,
  ownedCookies: StepDownCookie[] = [],
): boolean {
  const competingCookie = cookies.some(
    (cookie) =>
      KNOWN_AFFILIATE_COOKIE_NAME_PATTERNS.some((pattern) =>
        pattern.test(cookie.name),
      ) &&
      !ownedCookies.some(
        (own) => own.name === cookie.name && own.value === cookie.value,
      ),
  );
  if (competingCookie) return true;

  if (hasCompetingUrlParam(currentUrl, ownUrlParamKey, ownValue)) return true;

  return !!referrer && hasCompetingUrlParam(referrer, ownUrlParamKey, ownValue);
}

export async function checkStepDown(
  domain: string,
  currentUrl: string,
  ownUrlParamKey?: string | null,
  referrer?: string | null,
  ownValue?: string | null,
): Promise<boolean> {
  const cookies = await chrome.cookies.getAll({ domain });
  const key = `ownedAffiliateCookies:${domain}`;
  const stored = await chrome.storage.local.get(key);
  return detectStepDown(
    cookies,
    currentUrl,
    ownUrlParamKey,
    referrer,
    ownValue,
    stored[key] ?? [],
  );
}
