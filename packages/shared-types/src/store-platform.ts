// Recognising which shopping platform a store runs on, and what a checkout on it usually looks
// like. Used by the backend (reading the store's homepage) and by the extension (reading the live
// checkout), so both recognise a platform the same way.
//
// Templates are starting points, never trusted as they stand: the extension uses a template
// selector only where it matches exactly the right kind of element on the real checkout, and the
// final test proves the whole recipe before it can be sent. A wrong guess costs a click.

export const STORE_PLATFORMS = [
  'SHOPIFY',
  'WOOCOMMERCE',
  'BIGCOMMERCE',
  'MAGENTO',
  'WIX',
  'SQUARESPACE',
] as const;
export type StorePlatform = (typeof STORE_PLATFORMS)[number];

export const STORE_PLATFORM_LABELS: Record<StorePlatform, string> = {
  SHOPIFY: 'Shopify',
  WOOCOMMERCE: 'WooCommerce',
  BIGCOMMERCE: 'BigCommerce',
  MAGENTO: 'Magento',
  WIX: 'Wix',
  SQUARESPACE: 'Squarespace',
};

/** Telltale signs in a page's HTML or response headers, most specific platform first. */
const SIGNATURES: { platform: StorePlatform; html: RegExp[]; headers?: [string, RegExp][] }[] = [
  {
    platform: 'SHOPIFY',
    html: [/cdn\.shopify\.com/i, /\bShopify\.shop\s*=/, /\.myshopify\.com\b/i, /shopify-checkout-api-token/i],
    headers: [['x-shopid', /./], ['x-shopify-stage', /./], ['powered-by', /shopify/i]],
  },
  {
    platform: 'BIGCOMMERCE',
    html: [/cdn\d*\.bigcommerce\.com/i, /\bdata-stencil\b/i, /stencil-utils/i],
    headers: [['x-bc-storefront-request-id', /./]],
  },
  {
    platform: 'WOOCOMMERCE',
    html: [
      /wp-content\/plugins\/woocommerce\//i,
      /<meta[^>]+name=["']generator["'][^>]+content=["']WooCommerce/i,
      /\bclass=["'][^"']*\bwoocommerce(?:-page|-checkout|-cart)?\b/i,
      /\bwc-block-components-/i,
    ],
  },
  {
    platform: 'MAGENTO',
    html: [/\bdata-mage-init\b/i, /\bMagento_[A-Z]\w+\//, /mage\/cookies/i],
    headers: [['x-magento-cache-debug', /./], ['x-magento-tags', /./]],
  },
  {
    platform: 'WIX',
    html: [/static\.wixstatic\.com/i, /\bwix-bolt\b/i, /<meta[^>]+name=["']generator["'][^>]+content=["']Wix\.com/i],
    headers: [['x-wix-request-id', /./]],
  },
  {
    platform: 'SQUARESPACE',
    html: [/static1\.squarespace\.com/i, /\bSQUARESPACE_CONTEXT\b/],
    headers: [['server', /squarespace/i]],
  },
];

export interface PlatformDetection {
  platform: StorePlatform;
  /** What gave it away, for admins and logs ("cdn.shopify.com in the page"). */
  evidence: string;
}

/** The platform a page belongs to, from its HTML and (when known) its response headers. */
export function detectStorePlatform(
  html: string,
  headers: Record<string, string | undefined> = {},
): PlatformDetection | null {
  const lowerHeaders = Object.fromEntries(
    Object.entries(headers).map(([name, value]) => [name.toLowerCase(), value ?? '']),
  );
  for (const { platform, html: patterns, headers: headerSigns = [] } of SIGNATURES) {
    for (const [name, pattern] of headerSigns) {
      const value = lowerHeaders[name];
      if (value !== undefined && pattern.test(value)) return { platform, evidence: `${name} header` };
    }
    for (const pattern of patterns) {
      const match = pattern.exec(html);
      if (match) return { platform, evidence: `${match[0].slice(0, 60)} in the page` };
    }
  }
  return null;
}

/** POST /merchants/:id/platform/check: what reading the store's homepage found. */
export type PlatformCheckResponse =
  | { reachable: true; platform: StorePlatform | null; evidence: string | null; checkedAt: string }
  | { reachable: false; reason: string };

/** The parts of a checkout a template can fill in, each as candidate selectors, best first. The
 *  store's error message isn't among them: setup learns it by submitting a made-up code. */
export interface PlatformTemplate {
  /** Address fragments of the platform's checkout and cart pages. */
  checkoutUrlPatterns: string[];
  revealLink?: string[];
  promoField: string[];
  applyButton: string[];
  cartTotal: string[];
}

/**
 * Checkouts that look much the same on every store of the platform. Selectors lean on names,
 * ids and data attributes the platform itself sets, never on wording (stores translate it) or
 * theme classes. Platforms without one here are recognised, then set up by clicking.
 */
export const PLATFORM_TEMPLATES: Partial<Record<StorePlatform, PlatformTemplate>> = {
  SHOPIFY: {
    checkoutUrlPatterns: ['/checkouts/'],
    promoField: ['input[name="reductions"]', 'input[name="checkout[reduction_code]"]'],
    applyButton: [
      'form:has(input[name="reductions"]) button[type="submit"]',
      'form:has(input[name="checkout[reduction_code]"]) button[type="submit"]',
    ],
    cartTotal: ['[data-checkout-payment-due-target]', '.payment-due__price'],
  },
  WOOCOMMERCE: {
    checkoutUrlPatterns: ['/checkout', '/cart'],
    revealLink: ['a.showcoupon', '.wc-block-components-totals-coupon-link', '.wc-block-components-panel__button'],
    promoField: ['#coupon_code', 'input[name="coupon_code"]', 'input[id^="wc-block-components-totals-coupon__input"]'],
    applyButton: [
      'button[name="apply_coupon"]',
      'input[name="apply_coupon"]',
      '.wc-block-components-totals-coupon__button',
    ],
    cartTotal: [
      'tr.order-total .woocommerce-Price-amount',
      '.order-total .amount',
      '.wc-block-components-totals-footer-item .wc-block-components-totals-item__value',
    ],
  },
  BIGCOMMERCE: {
    checkoutUrlPatterns: ['/checkout', '/cart.php'],
    revealLink: ['[data-test="redeemable-label"]', 'a.redeemable-label'],
    promoField: ['#redeemableCode', 'input[name="redeemableCode"]'],
    applyButton: ['#applyRedeemableButton', '[data-test="redeemableEntry-submit"]'],
    cartTotal: ['[data-test="cart-total"] [data-test="cart-price-value"]', '[data-test="cart-total"] .cart-priceItem-value'],
  },
};
