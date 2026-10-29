declare const __API_BASE_URL__: string;
declare const __REVIEWER_ACCESS__: boolean;

// The backend baked in at build time (scripts/build.js). The desktop agent can override it at
// runtime via setApiBaseUrl; without an agent this is the backend the extension talks to.
export const DEFAULT_API_BASE_URL =
  typeof __API_BASE_URL__ === 'string' && __API_BASE_URL__ ? __API_BASE_URL__ : 'http://localhost:3000';

// Only the reviewer build turns reviewer access on; reviewers never enter or choose a backend
// address, they always use the bundled one.
export function getReviewerApiBaseUrl(): string | null {
  return typeof __REVIEWER_ACCESS__ === 'boolean' && __REVIEWER_ACCESS__ ? DEFAULT_API_BASE_URL : null;
}

export async function getApiBaseUrl(): Promise<string> {
  const { apiBaseUrl } = await chrome.storage.local.get('apiBaseUrl');
  return typeof apiBaseUrl === 'string' && apiBaseUrl.length > 0 ? apiBaseUrl : DEFAULT_API_BASE_URL;
}

export async function setApiBaseUrl(url: string): Promise<void> {
  await chrome.storage.local.set({ apiBaseUrl: url });
}

// Status must be re-confirmed at least this often.
export const STATUS_CHECK_INTERVAL_MINUTES = 15;

// Max time to keep operating on a stale "last known good" status after the status
// check itself starts failing (network down, etc) before force-disabling.
export const STATUS_GRACE_PERIOD_MS = 60 * 60 * 1000;

// How long a merchant-by-domain lookup is cached before being re-fetched.
export const MERCHANT_CACHE_TTL_MS = 10 * 60 * 1000;
// A store that is unknown, inactive or has no usable coupons yet is re-checked much sooner, so
// one added (or given coupons) in the admin starts working within a minute, not ten.
export const MERCHANT_MISS_CACHE_TTL_MS = 60 * 1000;
