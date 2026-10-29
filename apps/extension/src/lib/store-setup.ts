import {
  normalizeStoreSetupCode,
  STORE_SETUP_CODE_PATTERN,
  type RedeemStoreSetupCodeResponse,
  type StoreSetupExtensionSession,
  type StoreSetupMerchant,
  type SubmitStoreSetupRecipePayload,
} from '@saverlly/shared-types';
import { getApiBaseUrl } from './config';

// Store setup is an admin-only mode, entirely separate from shopper operation: it lives under its
// own storage keys and never reads or writes deviceToken, reviewerAccess, dormant, the merchant
// cache or tab state. Starting, ending or losing a setup session can't change what shoppers see.

const SESSION_KEY = 'storeSetupSession';
// The pending redemption secret, kept so a redemption whose response was lost can be retried
// with the same secret (the backend treats that as the same redemption, not a second one).
const ACTIVATION_KEY = 'storeSetupActivation';
const REQUEST_TIMEOUT_MS = 15_000;

/** What the extension keeps for an active setup session. */
export interface StoreSetupRecord {
  token: string;
  /** The backend that issued the session; every later call goes back to it. */
  apiBaseUrl: string;
  sessionId: string;
  expiresAt: string;
  merchant: StoreSetupMerchant;
}

/** The parts safe to hand to extension pages: everything except the token. */
export type StoreSetupStatus = Omit<StoreSetupRecord, 'token' | 'apiBaseUrl'>;

interface PendingActivation {
  token: string;
  code: string;
}

/** The session was cancelled, superseded, expired or rejected; it has been cleared locally. */
export class StoreSetupEndedError extends Error {
  constructor() {
    super('This store setup session has ended. Start a new one from the dashboard.');
  }
}

export function toStoreSetupStatus(record: StoreSetupRecord): StoreSetupStatus {
  return {
    sessionId: record.sessionId,
    expiresAt: record.expiresAt,
    merchant: record.merchant,
  };
}

function isRecord(value: unknown): value is StoreSetupRecord {
  if (!value || typeof value !== 'object') return false;
  const record = value as Partial<StoreSetupRecord>;
  const merchant = record.merchant as Partial<StoreSetupMerchant> | undefined;
  return (
    typeof record.token === 'string' &&
    typeof record.apiBaseUrl === 'string' &&
    typeof record.sessionId === 'string' &&
    typeof record.expiresAt === 'string' &&
    Number.isFinite(Date.parse(record.expiresAt)) &&
    typeof merchant?.id === 'string' &&
    typeof merchant.name === 'string' &&
    typeof merchant.domain === 'string'
  );
}

/** The active session, or null. An expired or malformed record is cleared on read. */
export async function getStoreSetup(): Promise<StoreSetupRecord | null> {
  const stored = (await chrome.storage.local.get(SESSION_KEY))[SESSION_KEY] as unknown;
  if (stored === undefined) return null;
  if (!isRecord(stored) || Date.parse(stored.expiresAt) <= Date.now()) {
    await clearStoreSetup();
    return null;
  }
  return stored;
}

export async function clearStoreSetup(): Promise<void> {
  await chrome.storage.local.remove(SESSION_KEY);
}

function newSecret(): string {
  return btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

async function errorMessage(res: Response, fallback: string): Promise<string> {
  const body = (await res.json().catch(() => ({}))) as { message?: unknown };
  if (typeof body.message === 'string') return body.message;
  if (Array.isArray(body.message) && typeof body.message[0] === 'string') return body.message[0];
  return fallback;
}

let redeeming: { code: string; promise: Promise<StoreSetupRecord> } | undefined;

/** Exchanges a dashboard code for a setup session. Concurrent calls for the same code share one
 *  request; a different code waits for the one in flight (they share the activation record),
 *  then is sent itself, so it never gets another code's answer. */
export function redeemStoreSetupCode(value: string): Promise<StoreSetupRecord> {
  const code = normalizeStoreSetupCode(value);
  if (redeeming?.code === code) return redeeming.promise;
  const previous = redeeming?.promise.catch(() => undefined);
  const promise: Promise<StoreSetupRecord> = (previous ?? Promise.resolve())
    .then(() => redeem(value))
    .finally(() => {
      if (redeeming?.promise === promise) redeeming = undefined;
    });
  redeeming = { code, promise };
  return promise;
}

async function redeem(value: string): Promise<StoreSetupRecord> {
  const code = normalizeStoreSetupCode(value);
  if (!STORE_SETUP_CODE_PATTERN.test(code))
    throw new Error('Enter the full setup code shown on the dashboard.');

  // A new code always gets a new secret: the old one may already be bound to the session a
  // previous code started, even if that response never arrived.
  const pending = (await chrome.storage.local.get(ACTIVATION_KEY))[ACTIVATION_KEY] as
    | Partial<PendingActivation>
    | undefined;
  const activation: PendingActivation =
    pending?.code === code && typeof pending.token === 'string'
      ? { code, token: pending.token }
      : { code, token: newSecret() };
  await chrome.storage.local.set({ [ACTIVATION_KEY]: activation });

  // The agent's backend or the one baked into the build, pinned to the session from here on.
  const apiBaseUrl = await getApiBaseUrl();
  const res = await fetch(`${apiBaseUrl}/store-setup/redeem`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(activation),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!res.ok) {
    // A definite rejection means this secret won't be retried; a 5xx or 429 might be.
    if (res.status < 500 && res.status !== 429)
      await chrome.storage.local.remove(ACTIVATION_KEY);
    throw new Error(
      res.status === 429
        ? 'Too many attempts. Wait a minute and try again.'
        : await errorMessage(res, 'Could not start store setup. Please try again.'),
    );
  }

  const body = (await res.json()) as RedeemStoreSetupCodeResponse;
  const record: StoreSetupRecord = {
    token: activation.token,
    apiBaseUrl,
    sessionId: body.sessionId,
    expiresAt: body.expiresAt,
    merchant: body.merchant,
  };
  await chrome.storage.local.remove(ACTIVATION_KEY);
  if (!isRecord(record) || Date.parse(record.expiresAt) <= Date.now())
    throw new Error('Could not start store setup. Please try again.');
  // One setup at a time: a session for another store would otherwise linger on the backend,
  // still usable, until it expired.
  const previous = await getStoreSetup();
  await chrome.storage.local.set({ [SESSION_KEY]: record });
  if (previous && previous.sessionId !== record.sessionId) await endRemote(previous);
  return record;
}

async function endRemote(record: StoreSetupRecord): Promise<void> {
  await fetch(`${record.apiBaseUrl}/store-setup/session/end`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${record.token}` },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  }).catch(() => {
    // Unreachable: the old session simply runs out at its own expiry.
  });
}

/** Calls a /store-setup/session route. A 401/403 ends the session locally and throws
 * StoreSetupEndedError; any other failure leaves it in place for a retry. */
async function sessionFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const record = await getStoreSetup();
  if (!record) throw new StoreSetupEndedError();
  const res = await fetch(`${record.apiBaseUrl}/store-setup/session${path}`, {
    ...init,
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    headers: {
      ...init.headers,
      Authorization: `Bearer ${record.token}`,
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
    },
  });
  if (res.status === 401 || res.status === 403) {
    // Only clear the session this request was made with, never one started meanwhile.
    if ((await getStoreSetup())?.sessionId === record.sessionId) await clearStoreSetup();
    throw new StoreSetupEndedError();
  }
  return res;
}

/** The session as the backend sees it: confirms it is still live, plus the store's live recipe. */
export async function fetchStoreSetupSession(): Promise<StoreSetupExtensionSession> {
  const res = await sessionFetch('');
  if (!res.ok) throw new Error(`Unexpected status ${res.status} from store setup session`);
  return (await res.json()) as StoreSetupExtensionSession;
}

/** Submits a draft for the admin to review and Save on the dashboard. */
export async function submitStoreSetupRecipe(
  payload: SubmitStoreSetupRecipePayload,
): Promise<StoreSetupExtensionSession> {
  const res = await sessionFetch('/recipe', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  if (!res.ok)
    throw new Error(await errorMessage(res, 'The store rejected this recipe. Run setup again.'));
  return (await res.json()) as StoreSetupExtensionSession;
}

/** Ends setup. Local state always clears, even if the backend can't be reached; the backend
 * session then simply runs out at its expiry. */
export async function endStoreSetup(): Promise<void> {
  const record = await getStoreSetup();
  if (!record) return;
  await clearStoreSetup();
  await endRemote(record);
}

/** "3h 52m", "12m", or "under a minute". */
export function formatTimeLeft(expiresAt: string, now = Date.now()): string {
  const minutes = Math.floor((Date.parse(expiresAt) - now) / 60_000);
  if (minutes < 1) return 'under a minute';
  const hours = Math.floor(minutes / 60);
  return hours > 0 ? `${hours}h ${minutes % 60}m` : `${minutes}m`;
}
