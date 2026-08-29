import type {
  ActiveAnnouncement,
  DeviceStatusResponse,
  RegisterDevicePayload,
  RegisterDeviceResponse,
} from '@saverlly/shared-types';
import { getApiBaseUrl } from './config';

const REQUEST_TIMEOUT_MS = 15_000;

export class DeviceAuthError extends Error {
  constructor(public status: number) {
    super(`Device auth failed with status ${status}`);
  }
}

async function apiFetch(path: string, token: string | null, init: RequestInit = {}): Promise<Response> {
  const res = await fetch(`${getApiBaseUrl()}${path}`, {
    ...init,
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    headers: {
      ...init.headers,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
    },
  });

  if (token && (res.status === 401 || res.status === 403)) {
    throw new DeviceAuthError(res.status);
  }
  return res;
}

export async function registerDevice(payload: RegisterDevicePayload): Promise<RegisterDeviceResponse> {
  const res = await apiFetch('/devices/register', null, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Device registration failed (${res.status}): ${body}`);
  }
  return (await res.json()) as RegisterDeviceResponse;
}

/** Deletes this device's row and tokens from the backend. Called once, on agent uninstall. */
export async function deregisterDevice(token: string): Promise<void> {
  const res = await apiFetch('/public/devices/me', token, { method: 'DELETE' });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Device deregistration failed (${res.status}): ${body}`);
  }
}

export async function fetchDeviceStatus(token: string): Promise<DeviceStatusResponse> {
  const res = await apiFetch('/public/devices/me/status', token);
  if (!res.ok) {
    throw new Error(`Unexpected status ${res.status} from device status check`);
  }
  return (await res.json()) as DeviceStatusResponse;
}

export async function fetchActiveAnnouncements(token: string): Promise<ActiveAnnouncement[]> {
  const res = await apiFetch('/public/announcements/active', token);
  if (!res.ok) {
    throw new Error(`Unexpected status ${res.status} from active-announcements check`);
  }
  return (await res.json()) as ActiveAnnouncement[];
}
