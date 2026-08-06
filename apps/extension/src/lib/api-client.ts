import type {
  CreateCouponTestEventPayload,
  DeviceStatusResponse,
  LifetimeSavingsResponse,
  PublicMerchant,
} from '@saverlly/shared-types';
import { getApiBaseUrl, STATUS_GRACE_PERIOD_MS } from './config';
import { getDeviceToken, setDormant } from './storage';

export class AuthError extends Error {
  constructor(public status: number) {
    super(`Device auth failed with status ${status}`);
  }
}

// Well under STATUS_GRACE_PERIOD_MS — a stalled request must fail fast enough for the
// grace-period fallback in status-check.ts to actually kick in rather than hanging.
const REQUEST_TIMEOUT_MS = 15_000;

function withTimeout(signal: AbortSignal | null | undefined): AbortSignal {
  const timeoutSignal = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
  return signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal;
}

async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const [baseUrl, token] = await Promise.all([getApiBaseUrl(), getDeviceToken()]);
  if (!token) {
    await setDormant(true);
    throw new AuthError(401);
  }

  const res = await fetch(`${baseUrl}${path}`, {
    ...init,
    signal: withTimeout(init.signal),
    headers: {
      ...init.headers,
      Authorization: `Bearer ${token}`,
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
    },
  });

  if (res.status === 401 || res.status === 403) {
    // Any auth rejection means the extension must go dormant immediately —
    // covers revoked tokens, disabled devices, and inactive kiosks alike.
    await setDormant(true);
    throw new AuthError(res.status);
  }

  return res;
}

export async function fetchDeviceStatus(): Promise<DeviceStatusResponse> {
  const res = await apiFetch('/public/devices/me/status');
  if (!res.ok) {
    throw new Error(`Unexpected status ${res.status} from device status check`);
  }
  return res.json();
}

export async function fetchMerchantByDomain(domain: string): Promise<PublicMerchant | null> {
  const res = await apiFetch(`/public/merchants/by-domain/${encodeURIComponent(domain)}`);
  if (res.status === 404) {
    return null;
  }
  if (!res.ok) {
    throw new Error(`Unexpected status ${res.status} from merchant lookup`);
  }
  return res.json();
}

export async function fetchLifetimeSaved(): Promise<number> {
  const res = await apiFetch('/public/devices/me/savings');
  if (!res.ok) {
    throw new Error(`Unexpected status ${res.status} from lifetime savings lookup`);
  }
  const body: LifetimeSavingsResponse = await res.json();
  return body.lifetimeSaved;
}

export async function reportCouponTestEvent(payload: CreateCouponTestEventPayload): Promise<void> {
  const res = await apiFetch('/public/coupon-test-events', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    throw new Error(`Unexpected status ${res.status} reporting coupon test event`);
  }
}
