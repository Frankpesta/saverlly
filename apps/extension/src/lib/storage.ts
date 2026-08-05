import type { PublicMerchant } from '@saverlly/shared-types';

interface MerchantCacheEntry {
  merchant: PublicMerchant | null;
  fetchedAt: number;
}

interface AttributionLogEntry {
  domain: string;
  merchantId: string;
  method: 'COOKIE' | 'URL_PARAM' | 'BOTH';
  timestamp: number;
}

const KEYS = {
  deviceToken: 'deviceToken',
  dormant: 'dormant',
  lastStatusOkAt: 'lastStatusOkAt',
  merchantCache: 'merchantCache',
  attributionLog: 'attributionLog',
} as const;

export async function getDeviceToken(): Promise<string | null> {
  const result = await chrome.storage.local.get(KEYS.deviceToken);
  return (result[KEYS.deviceToken] as string | undefined) ?? null;
}

export async function setDeviceToken(token: string | null): Promise<void> {
  if (token) {
    await chrome.storage.local.set({ [KEYS.deviceToken]: token });
  } else {
    await chrome.storage.local.remove(KEYS.deviceToken);
  }
}

export async function isDormant(): Promise<boolean> {
  const result = await chrome.storage.local.get(KEYS.dormant);
  return result[KEYS.dormant] === true;
}

export async function setDormant(dormant: boolean): Promise<void> {
  await chrome.storage.local.set({ [KEYS.dormant]: dormant });
}

export async function getLastStatusOkAt(): Promise<number | null> {
  const result = await chrome.storage.local.get(KEYS.lastStatusOkAt);
  return (result[KEYS.lastStatusOkAt] as number | undefined) ?? null;
}

export async function setLastStatusOkAt(timestamp: number): Promise<void> {
  await chrome.storage.local.set({ [KEYS.lastStatusOkAt]: timestamp });
}

export async function getCachedMerchant(domain: string): Promise<MerchantCacheEntry | null> {
  const result = await chrome.storage.local.get(KEYS.merchantCache);
  const cache = (result[KEYS.merchantCache] as Record<string, MerchantCacheEntry> | undefined) ?? {};
  return cache[domain] ?? null;
}

export async function setCachedMerchant(domain: string, entry: MerchantCacheEntry): Promise<void> {
  const result = await chrome.storage.local.get(KEYS.merchantCache);
  const cache = (result[KEYS.merchantCache] as Record<string, MerchantCacheEntry> | undefined) ?? {};
  cache[domain] = entry;
  await chrome.storage.local.set({ [KEYS.merchantCache]: cache });
}

export async function clearMerchantCache(): Promise<void> {
  await chrome.storage.local.remove(KEYS.merchantCache);
}

const ATTRIBUTION_LOG_MAX_ENTRIES = 200;

export async function appendAttributionLog(entry: AttributionLogEntry): Promise<void> {
  const result = await chrome.storage.local.get(KEYS.attributionLog);
  const log = (result[KEYS.attributionLog] as AttributionLogEntry[] | undefined) ?? [];
  log.push(entry);
  const trimmed = log.length > ATTRIBUTION_LOG_MAX_ENTRIES ? log.slice(-ATTRIBUTION_LOG_MAX_ENTRIES) : log;
  await chrome.storage.local.set({ [KEYS.attributionLog]: trimmed });
}
