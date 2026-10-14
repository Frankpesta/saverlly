// Known third-party affiliate tracking signals, used to detect a *competing* affiliate
// relationship already active on a merchant site (the step-down rule). This list grows
// as networks are integrated/observed. It is not exhaustive.
//
// Cookies are only a fallback: most networks set their click cookie on their own redirect
// domain, not the merchant's, so the reliable signal is the landing navigation itself (see
// step-down-check.ts' recordLandingSignal). These are first-party merchant-domain cookies a
// network's site tag writes only when the visit arrived through an affiliate click.
export const KNOWN_AFFILIATE_COOKIE_NAME_PATTERNS: RegExp[] = [
  /^irclickid$/i, // Impact
  /^IR_\d+$/, // Impact UTT, written per campaign only on an affiliate click
  /^cj[_-]?event$/i, // CJ Affiliate
  /^cje$/i, // CJ site tag
  /^ran(mid|siteid)$/i, // Rakuten Advertising
  /^rmStore$/i, // Rakuten site tag
  /^awc$/i, // Awin
  /^_aw_m_\d+$/, // Awin MasterTag
  /^sscid$/i, // ShareASale
  /^partnerstack/i,
  /^gclid$/i, // Google Ads (not affiliate per se, but a common competing attribution signal)
];

// Known third-party affiliate URL query param keys (distinct from Saverlly's own
// affiliateUrlParamKey, which is merchant-specific and checked separately). Matched
// case-insensitively: Rakuten, for one, sends ranMID/ranSiteID/ranEAID in mixed case.
export const KNOWN_AFFILIATE_URL_PARAM_PATTERNS: string[] = [
  'irclickid',
  'irgwc', // Impact gateway
  'clickid',
  'clkid', // Impact click id as forwarded by Target and other Impact merchants
  'afid', // Target affiliate id
  'cjevent',
  'cjdata',
  'ranmid',
  'ransiteid',
  'raneaid',
  'awc',
  'sscid',
  'afsrc', // Industry-standard "an affiliate is already involved" stand-down flag
  'aff_id',
  'affid',
  'affiliate_id',
  'aff_sub',
  'pjmid', // Pepperjam / Ascend
  'clickref', // Partnerize
];

// Amazon Associates. `tag` is far too generic a parameter name to treat as an affiliate
// signal on every site, so it only counts on Amazon's own domains.
export const AMAZON_ASSOCIATE_PARAMS = ['tag', 'ascsubtag', 'linkcode'];
export const AMAZON_HOST = /(^|\.)amazon\.[a-z.]+$/i;

// utm_* values publishers and cashback portals stamp on outbound affiliate links.
export const AFFILIATE_UTM_MEDIUM = /affiliat|cashback|partnerize/i;
export const AFFILIATE_UTM_SOURCE =
  /^(rakuten|ebates|honey|capital\s*one\s*shopping|capitaloneshopping|retailmenot|topcashback|befrugal|ibotta|slickdeals|skimlinks|sovrn|viglink|cj|impact|awin|shareasale|pepperjam|partnerize|ltk|rewardstyle)$/i;

// Redirect hosts that only exist to record an affiliate click and bounce to the merchant.
// A landing that came through one of these (server or client redirect) is an affiliate visit
// even when the final merchant URL carries no tracking parameter at all.
export const AFFILIATE_NETWORK_HOSTS: RegExp[] = [
  /(^|\.)linksynergy\.com$/i, // Rakuten
  /(^|\.)(anrdoezrs|jdoqocy|tkqlhce|dpbolvw|kqzyfj|emjcd|qksrv|afcyhf|lduhtrp|ftjcfx|awltovhc|tqlkg|yceml|ojrq)\.net$/i, // CJ
  /(^|\.)awin1\.com$/i,
  /(^|\.)shareasale\.com$/i,
  /(^|\.)(sjv\.io|pxf\.io|7eer\.net|evyy\.net|ojrq\.net|ttt\.xyz|impactradius\.com|impact\.com)$/i, // Impact vanity/redirect domains
  /^goto\.(target|walmart)\.com$/i, // Retailer-branded Impact click domains
  /(^|\.)(go\.skimresources\.com|redirectingat\.com|skimlinks\.com)$/i,
  /(^|\.)(viglink\.com|sovrn\.com)$/i,
  /(^|\.)(pntra|pntrs|pntrac|gopjn)\.com$/i, // Pepperjam
  /(^|\.)prf\.hn$/i, // Partnerize
  /(^|\.)avantlink\.com$/i,
  /(^|\.)(webgains|tradedoubler|flexoffers)\.com$/i,
  /(^|\.)(rstyle\.me|liketoknow\.it|shopltk\.com|howl\.me|shopstyle\.it|narrativ\.com|bam-x\.com)$/i,
  /(^|\.)(amzn\.to|amzn\.com)$/i,
  /(^|\.)(rakuten\.com|ebates\.com|topcashback\.com|befrugal\.com|retailmenot\.com|joinhoney\.com|capitaloneshopping\.com|slickdeals\.net|ibotta\.com|dealspotr\.com|couponfollow\.com)$/i,
];
