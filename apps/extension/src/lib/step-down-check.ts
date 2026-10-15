import {
  AFFILIATE_NETWORK_HOSTS,
  AFFILIATE_UTM_MEDIUM,
  AFFILIATE_UTM_SOURCE,
  AMAZON_ASSOCIATE_PARAMS,
  AMAZON_HOST,
  KNOWN_AFFILIATE_COOKIE_NAME_PATTERNS,
  KNOWN_AFFILIATE_URL_PARAM_PATTERNS,
} from "./affiliate-network-signals";

export interface StepDownCookie {
  name: string;
  value?: string;
}

/** Saverlly's own tracking parameters for a merchant. Never a competing signal. */
export interface OwnTrackingParams {
  key?: string | null;
  value?: string | null;
  subIdKey?: string | null;
}

// A competitor stays "active" for the rest of the browser session (chrome.storage.session is
// wiped when the browser closes), capped so a browser left open for days eventually recovers.
export const STAND_DOWN_TTL_MS = 24 * 60 * 60 * 1000;

export function isAffiliateNetworkUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  try {
    const { hostname } = new URL(url);
    return AFFILIATE_NETWORK_HOSTS.some((pattern) => pattern.test(hostname));
  } catch {
    return false;
  }
}

export function hasCompetingUrlParam(
  url: string,
  ownUrlParamKey?: string | null,
  ownValue?: string | null,
  ownSubIdKey?: string | null,
): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  const own = ownUrlParamKey?.toLowerCase();
  const ownSubId = ownSubIdKey?.toLowerCase();
  const amazon = AMAZON_HOST.test(parsed.hostname);
  const pairs: Array<[string, string]> = [];
  parsed.searchParams.forEach((value, key) => pairs.push([key, value]));
  for (const [rawKey, value] of pairs) {
    const key = rawKey.toLowerCase();
    // Our own attribution parameter, carrying our own value, is never a competitor. The same
    // key carrying someone else's value is: that is a competitor on the same network.
    if (key === own && ownValue != null && value === ownValue) continue;
    if (key === ownSubId) continue;
    if (KNOWN_AFFILIATE_URL_PARAM_PATTERNS.includes(key)) return true;
    if (amazon && AMAZON_ASSOCIATE_PARAMS.includes(key) && value) return true;
    if (key === "utm_medium" && AFFILIATE_UTM_MEDIUM.test(value)) return true;
    if (key === "utm_source" && AFFILIATE_UTM_SOURCE.test(value.trim()))
      return true;
  }
  return false;
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

  return (
    !!referrer &&
    (isAffiliateNetworkUrl(referrer) ||
      hasCompetingUrlParam(referrer, ownUrlParamKey, ownValue))
  );
}

/**
 * Was this top-frame landing an affiliate visit? Checked when the merchant page commits,
 * which is the only moment the evidence still exists: by the time the shopper reaches
 * checkout, the tracking parameters have been dropped from the URL and the network's
 * redirect hop is several navigations back.
 *
 * `redirectedFrom` is the URL the navigation started at before any server redirect (or the
 * page that performed a client redirect), e.g. click.linksynergy.com/... -> target.com.
 */
export function isAffiliateLanding(
  url: string,
  redirectedFrom: string | null | undefined,
  own: OwnTrackingParams = {},
): boolean {
  if (hasCompetingUrlParam(url, own.key, own.value, own.subIdKey)) return true;
  if (!redirectedFrom || redirectedFrom === url) return false;
  return (
    isAffiliateNetworkUrl(redirectedFrom) ||
    hasCompetingUrlParam(redirectedFrom, own.key, own.value, own.subIdKey)
  );
}

interface StandDownRecord {
  /** When the competing affiliate landing was observed. */
  at: number;
  /** When the shopper explicitly chose to activate Saverlly anyway, if they did. */
  overriddenAt?: number;
}

const standDownKey = (domain: string) => `standDown:${domain.toLowerCase()}`;

async function readStandDown(domain: string): Promise<StandDownRecord | undefined> {
  const key = standDownKey(domain);
  return (await chrome.storage?.session?.get(key))?.[key] as
    | StandDownRecord
    | undefined;
}

export async function recordAffiliateLanding(domain: string): Promise<void> {
  await chrome.storage?.session?.set({
    [standDownKey(domain)]: { at: Date.now() } satisfies StandDownRecord,
  });
}

/** The shopper pressed "Activate Your Savings" on the paused screen. Honour it until a
 *  newer competing affiliate landing happens. */
export async function overrideStandDown(domain: string): Promise<void> {
  const stored = await readStandDown(domain);
  await chrome.storage?.session?.set({
    [standDownKey(domain)]: { at: stored?.at ?? 0, overriddenAt: Date.now() },
  });
}

export async function isStandingDown(domain: string): Promise<boolean> {
  const record = await readStandDown(domain);
  if (!record || Date.now() - record.at > STAND_DOWN_TTL_MS) return false;
  return !(record.overriddenAt && record.overriddenAt >= record.at);
}

async function hasOverride(domain: string): Promise<boolean> {
  const record = await readStandDown(domain);
  return !!record?.overriddenAt && record.overriddenAt >= record.at;
}

export async function checkStepDown(
  domain: string,
  currentUrl: string,
  ownUrlParamKey?: string | null,
  referrer?: string | null,
  ownValue?: string | null,
): Promise<boolean> {
  if (await isStandingDown(domain)) return true;
  // An explicit "Activate Your Savings" outranks the weaker checkout-time signals below
  // (lingering cookies), otherwise the paused screen would come straight back on reload.
  if (await hasOverride(domain)) return false;
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
