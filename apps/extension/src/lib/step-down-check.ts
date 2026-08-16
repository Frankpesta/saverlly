import { KNOWN_AFFILIATE_COOKIE_NAME_PATTERNS, KNOWN_AFFILIATE_URL_PARAM_PATTERNS } from './affiliate-network-signals';

export interface StepDownCookie {
  name: string;
}

function hasCompetingUrlParam(url: string, ownUrlParamKey?: string | null): boolean {
  try {
    const params = new URL(url).searchParams;
    return KNOWN_AFFILIATE_URL_PARAM_PATTERNS.some(
      (key) => key !== ownUrlParamKey && params.has(key),
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
): boolean {
  const competingCookie = cookies.some((cookie) =>
    KNOWN_AFFILIATE_COOKIE_NAME_PATTERNS.some((pattern) => pattern.test(cookie.name)),
  );
  if (competingCookie) return true;

  if (hasCompetingUrlParam(currentUrl, ownUrlParamKey)) return true;

  return !!referrer && hasCompetingUrlParam(referrer, ownUrlParamKey);
}

export async function checkStepDown(
  domain: string,
  currentUrl: string,
  ownUrlParamKey?: string | null,
  referrer?: string | null,
): Promise<boolean> {
  const cookies = await chrome.cookies.getAll({ domain });
  return detectStepDown(cookies, currentUrl, ownUrlParamKey, referrer);
}
