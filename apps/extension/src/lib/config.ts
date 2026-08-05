// Swap for the deployed API origin at build/packaging time, or override at runtime via
// setApiBaseUrl (the desktop agent will do this via native messaging in Phase 4).
export const DEFAULT_API_BASE_URL = 'http://localhost:3000';

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
