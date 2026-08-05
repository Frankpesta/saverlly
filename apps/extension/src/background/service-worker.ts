import type { PublicMerchant } from '@saverlly/shared-types';
import { fetchMerchantByDomain, reportCouponTestEvent } from '../lib/api-client';
import { runAttribution } from '../lib/attribution';
import { STATUS_CHECK_INTERVAL_MINUTES, MERCHANT_CACHE_TTL_MS } from '../lib/config';
import type { ExtensionMessage, InjectedCheckoutContext, TabCheckoutState } from '../lib/messages';
import { checkStepDown } from '../lib/step-down-check';
import { checkDeviceStatus } from '../lib/status-check';
import { getCachedMerchant, isDormant, setCachedMerchant } from '../lib/storage';

const STATUS_ALARM = 'saverlly-status-check';
const BADGE_READY = { text: '%', color: '#16A34A' };
const BADGE_SUPPRESSED = { text: '!', color: '#9CA3AF' };

// In-memory only — re-derived on demand if the service worker is recycled by Chrome,
// so losing it just means the popup shows "no offer detected" until next navigation.
const tabState = new Map<number, TabCheckoutState>();

chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create(STATUS_ALARM, { periodInMinutes: STATUS_CHECK_INTERVAL_MINUTES });
  void checkDeviceStatus();
});

chrome.runtime.onStartup.addListener(() => {
  void checkDeviceStatus();
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === STATUS_ALARM) void checkDeviceStatus();
});

chrome.tabs.onRemoved.addListener((tabId) => tabState.delete(tabId));

async function getMerchantCached(domain: string): Promise<PublicMerchant | null> {
  const cached = await getCachedMerchant(domain);
  if (cached && Date.now() - cached.fetchedAt < MERCHANT_CACHE_TTL_MS) {
    return cached.merchant;
  }
  const merchant = await fetchMerchantByDomain(domain);
  await setCachedMerchant(domain, { merchant, fetchedAt: Date.now() });
  return merchant;
}

async function resolveMerchant(hostname: string): Promise<PublicMerchant | null> {
  const candidates = Array.from(new Set([hostname, hostname.replace(/^www\./, '')]));
  for (const domain of candidates) {
    const merchant = await getMerchantCached(domain);
    if (merchant) return merchant;
  }
  return null;
}

function setBadge(tabId: number, state: { text: string; color: string } | null): void {
  chrome.action.setBadgeText({ tabId, text: state?.text ?? '' });
  if (state) chrome.action.setBadgeBackgroundColor({ tabId, color: state.color });
}

async function injectWithContext(tabId: number, files: string[], context: InjectedCheckoutContext): Promise<void> {
  await chrome.scripting.executeScript({
    target: { tabId },
    func: (ctx) => {
      (window as unknown as { __SAVERLLY__?: unknown }).__SAVERLLY__ = ctx;
    },
    args: [context],
  });
  await chrome.scripting.executeScript({ target: { tabId }, files });
}

chrome.webNavigation.onCommitted.addListener(async (details) => {
  if (details.frameId !== 0) return;
  if (await isDormant()) return;

  let hostname: string;
  try {
    hostname = new URL(details.url).hostname;
  } catch {
    return;
  }

  const merchant = await resolveMerchant(hostname);
  if (!merchant || !merchant.active) {
    tabState.delete(details.tabId);
    setBadge(details.tabId, null);
    return;
  }

  // Attribution fires on every active-merchant visit, independent of coupon availability.
  const redirectedTo = await runAttribution(details.tabId, details.url, merchant);
  if (redirectedTo) return; // the redirect re-triggers onCommitted for the param-appended URL

  if (!merchant.coupons.length || !merchant.checkoutRecipe) {
    tabState.delete(details.tabId);
    setBadge(details.tabId, null);
    return;
  }

  try {
    await injectWithContext(
      details.tabId,
      ['content-scripts/checkout-detector.js'],
      { merchantId: merchant.id, recipe: merchant.checkoutRecipe },
    );
  } catch {
    // Restricted page (chrome://, webstore) or tab closed mid-navigation — ignore.
  }
});

async function onCheckoutConfirmed(tabId: number, merchantId: string): Promise<void> {
  if (await isDormant()) return;

  const tab = await chrome.tabs.get(tabId).catch(() => undefined);
  if (!tab?.url) return;

  let hostname: string;
  try {
    hostname = new URL(tab.url).hostname;
  } catch {
    return;
  }

  const merchant = await resolveMerchant(hostname);
  if (!merchant || merchant.id !== merchantId) return;

  const suppressed = await checkStepDown(merchant.domain, tab.url, merchant.affiliateUrlParamKey);
  tabState.set(tabId, {
    merchantId: merchant.id,
    merchantName: merchant.name,
    coupons: merchant.coupons,
    suppressedStepdown: suppressed,
  });

  if (suppressed) {
    await reportCouponTestEvent({ merchantId: merchant.id, result: 'suppressed_stepdown' });
    setBadge(tabId, BADGE_SUPPRESSED);
    return; // no auto-popup — the toolbar icon still opens the popup for a manual apply
  }

  setBadge(tabId, BADGE_READY);
  try {
    // Best-effort only: Chrome may refuse this outside a user gesture / focused window.
    // The badge above is the guaranteed fallback affordance either way.
    await (chrome.action as unknown as { openPopup?: () => Promise<void> }).openPopup?.();
  } catch {
    // ignored — see comment above
  }
}

async function triggerApply(tabId: number): Promise<void> {
  if (await isDormant()) return;

  const state = tabState.get(tabId);
  const tab = await chrome.tabs.get(tabId).catch(() => undefined);
  if (!state || !tab?.url) return;

  if (!state.coupons.length) {
    await reportCouponTestEvent({ merchantId: state.merchantId, result: 'no_coupons_available' });
    return;
  }

  let hostname: string;
  try {
    hostname = new URL(tab.url).hostname;
  } catch {
    return;
  }

  const merchant = await resolveMerchant(hostname);
  if (!merchant?.checkoutRecipe) return;

  await injectWithContext(
    tabId,
    ['content-scripts/coupon-applier.js'],
    { merchantId: merchant.id, recipe: merchant.checkoutRecipe, coupons: state.coupons },
  );
}

async function getActiveTabId(): Promise<number | undefined> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab?.id;
}

async function handleMessage(message: ExtensionMessage, sender: chrome.runtime.MessageSender): Promise<unknown> {
  switch (message.type) {
    case 'CHECKOUT_CONFIRMED': {
      const tabId = sender.tab?.id;
      if (tabId === undefined) return;
      await onCheckoutConfirmed(tabId, message.merchantId);
      return;
    }
    case 'COUPON_APPLY_RESULT': {
      await reportCouponTestEvent({
        merchantId: message.merchantId,
        couponId: message.couponId ?? undefined,
        result: message.result,
      });
      // Fire-and-forget: notifies an open popup, if any, to update its UI. No-op if none is open.
      chrome.runtime.sendMessage({ type: 'APPLY_DONE', result: message.result }).catch(() => {});
      return;
    }
    case 'GET_TAB_STATE': {
      if (await isDormant()) return null;
      const tabId = await getActiveTabId();
      return tabId !== undefined ? (tabState.get(tabId) ?? null) : null;
    }
    case 'APPLY_BEST_COUPON': {
      const tabId = await getActiveTabId();
      if (tabId !== undefined) await triggerApply(tabId);
      return;
    }
    default:
      return;
  }
}

chrome.runtime.onMessage.addListener((message: ExtensionMessage, sender, sendResponse) => {
  handleMessage(message, sender)
    .then(sendResponse)
    .catch((err) => {
      console.error('[saverlly] message handling failed', err);
      sendResponse(undefined);
    });
  return true; // keep the message channel open for the async sendResponse above
});
