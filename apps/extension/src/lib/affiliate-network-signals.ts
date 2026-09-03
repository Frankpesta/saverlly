// Known third-party affiliate tracking signals, used to detect a *competing* affiliate
// relationship already active on a merchant site (the step-down rule). This list grows
// as networks are integrated/observed. It is not exhaustive.
export const KNOWN_AFFILIATE_COOKIE_NAME_PATTERNS: RegExp[] = [
  /^irclickid$/i, // Impact
  /^cj[_-]?event$/i, // CJ Affiliate
  /^ran(mid|siteid)$/i, // Rakuten Advertising
  /^awc$/i, // Awin
  /^sscid$/i, // ShareASale
  /^partnerstack/i,
  /^gclid$/i, // Google Ads (not affiliate per se, but a common competing attribution signal)
];

// Known third-party affiliate URL query param keys (distinct from Saverlly's own
// affiliateUrlParamKey, which is merchant-specific and checked separately).
export const KNOWN_AFFILIATE_URL_PARAM_PATTERNS: string[] = [
  'irclickid',
  'cjevent',
  'ranmid',
  'ransiteid',
  'awc',
  'sscid',
];
