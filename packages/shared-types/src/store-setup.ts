import { CheckoutRecipe } from './checkout-recipe';

// Easy Store Setup: an admin issues a one-time code on the dashboard, the extension redeems it
// for a session scoped to one merchant, then submits a draft recipe for the admin to Save.

/** Same unambiguous charset as location setup codes (no 0/O, 1/I/L). */
export const STORE_SETUP_CODE_PATTERN = /^SET[A-HJKMNP-Z2-9]{8}$/;

/**
 * Canonical form of a code as typed by an admin: separators and whitespace removed, uppercased,
 * and the SET prefix restored if it was left off. "set-7k4q-92md", "7K4Q 92MD" and
 * "SET7K4Q92MD" all normalize to "SET7K4Q92MD". Does not validate; test the result against
 * STORE_SETUP_CODE_PATTERN.
 */
export function normalizeStoreSetupCode(value: string): string {
  const compact = value.replace(/[-\s]/g, '').toUpperCase();
  return compact.length === 8 ? `SET${compact}` : compact;
}

/** Display form of a canonical code: "SET7K4Q92MD" -> "SET-7K4Q-92MD". */
export function formatStoreSetupCode(code: string): string {
  return `${code.slice(0, 3)}-${code.slice(3, 7)}-${code.slice(7)}`;
}

/**
 * The status the dashboard shows. EXPIRED is derived at read time: an unredeemed code past its
 * expiry, or a connected session that ended before any draft was submitted. A SUBMITTED draft
 * never expires on its own; it stays reviewable until the admin saves or discards it.
 */
export type StoreSetupState =
  | 'PENDING'
  | 'CONNECTED'
  | 'SUBMITTED'
  | 'APPLIED'
  | 'CANCELLED'
  | 'EXPIRED';

/** One line of the plain-language test result, keyed to the recipe step it checked. */
export const STORE_SETUP_CHECK_KEYS = [
  'checkoutPage',
  'revealLink',
  'promoField',
  'applyButton',
  'cartTotal',
  'failureMessage',
  'successMessage',
  'applyMode',
] as const;
export type StoreSetupCheckKey = (typeof STORE_SETUP_CHECK_KEYS)[number];

/** Plain-language names for each check, in the order they're shown, in the extension's panel
 *  and on the dashboard alike. */
export const STORE_SETUP_CHECK_LABELS: Record<StoreSetupCheckKey, string> = {
  checkoutPage: 'Checkout page',
  revealLink: 'Promo code link',
  promoField: 'Promo code box',
  applyButton: 'Apply button',
  cartTotal: 'Order total',
  failureMessage: 'Message for a rejected code',
  successMessage: 'Message for an accepted code',
  applyMode: 'Trying one code after another',
};

export const STORE_SETUP_CHECK_OUTCOMES = ['pass', 'fail', 'skipped'] as const;
export type StoreSetupCheckOutcome = (typeof STORE_SETUP_CHECK_OUTCOMES)[number];

export interface StoreSetupCheck {
  key: StoreSetupCheckKey;
  outcome: StoreSetupCheckOutcome;
  /** Short plain-language explanation shown to the admin, e.g. "Store rejected the test code". */
  detail?: string;
}

export interface StoreSetupTestResult {
  passed: boolean;
  checks: StoreSetupCheck[];
  /** Order total the recipe read from the page during the test, if it could. */
  cartTotal?: number;
  testedAt: string;
}

/** Admin-facing view of a setup session. Hashes are never included. */
export interface StoreSetupSessionView {
  id: string;
  merchantId: string;
  state: StoreSetupState;
  /** True while the extension's session token is still accepted. */
  extensionActive: boolean;
  codeExpiresAt: string;
  sessionExpiresAt: string | null;
  connectedAt: string | null;
  lastSeenAt: string | null;
  submittedAt: string | null;
  appliedAt: string | null;
  cancelledAt: string | null;
  createdAt: string;
  createdById: string | null;
  appliedById: string | null;
  draftRecipe: CheckoutRecipe | null;
  testResult: StoreSetupTestResult | null;
}

/** Returned once, when the code is issued. The plaintext code is never retrievable again. */
export interface IssuedStoreSetupCode {
  /** Display form, e.g. "SET-7K4Q-92MD". */
  code: string;
  session: StoreSetupSessionView;
}

export interface CurrentStoreSetupSessionResponse {
  session: StoreSetupSessionView | null;
}

export interface StoreSetupMerchant {
  id: string;
  name: string;
  domain: string;
}

export interface RedeemStoreSetupCodeResponse {
  sessionId: string;
  expiresAt: string;
  merchant: StoreSetupMerchant;
}

/** What the extension sees once redeemed: only the one merchant it was issued for. */
export interface StoreSetupExtensionSession {
  sessionId: string;
  state: 'CONNECTED' | 'SUBMITTED';
  expiresAt: string;
  submittedAt: string | null;
  merchant: StoreSetupMerchant & { checkoutRecipe: CheckoutRecipe | null };
}

/** The dashboard Save names the draft the admin reviewed, so a newer one is never saved unseen. */
export interface ApplyStoreSetupPayload {
  submittedAt: string;
}

export interface SubmitStoreSetupRecipePayload {
  recipe: CheckoutRecipe;
  testResult: StoreSetupTestResult;
}
