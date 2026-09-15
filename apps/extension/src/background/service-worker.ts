import type { PublicMerchant } from '@saverlly/shared-types';
import {
  fetchActivePromotions,
  fetchLifetimeSaved,
  fetchMerchantByDomain,
  reportCouponTestEvent,
} from '../lib/api-client';
import { runAttribution } from '../lib/attribution';
import { STATUS_CHECK_INTERVAL_MINUTES, MERCHANT_CACHE_TTL_MS } from '../lib/config';
import type {
  CouponApplyResultMessage,
  ExtensionMessage,
  InjectedCheckoutContext,
  TabCheckoutState,
} from '../lib/messages';
import { connectToAgentAndReceiveToken } from '../lib/native-messaging';
import { checkStepDown } from '../lib/step-down-check';
import { checkDeviceStatus } from '../lib/status-check';
import {
  getCachedMerchant,
  getPersistedTabState,
  isDormant,
  removePersistedTabState,
  setCachedMerchant,
  setPersistedTabState,
  setPendingApply,
  takePendingApply,
} from '../lib/storage';

const STATUS_ALARM = 'saverlly-status-check';
const BADGE_READY = { text: '%', color: '#16A34A' };
const BADGE_SUPPRESSED = { text: '!', color: '#9CA3AF' };

// In-memory cache, mirrored to chrome.storage.session (not .local -- see storage.ts) on every
// write. Chrome recycles this service worker whenever it's been idle, which previously wiped
// this Map outright and left the popup showing "no offer detected" even right after a real
// success. Reads that must survive a mid-run recycle (GET_TAB_STATE, triggerApply,
// patchTabState) go through loadTabState, which falls back to the persisted copy on a cache
// miss; the Map still makes the common case (no recycle) synchronous.
const tabState = new Map<number, TabCheckoutState>();

async function loadTabState(tabId: number): Promise<TabCheckoutState | null> {
  const cached = tabState.get(tabId);
  if (cached) return cached;
  const persisted = await getPersistedTabState(tabId);
  if (persisted) tabState.set(tabId, persisted);
  return persisted;
}

function saveTabState(tabId: number, state: TabCheckoutState): void {
  tabState.set(tabId, state);
  void setPersistedTabState(tabId, state);
}

function clearTabState(tabId: number): void {
  tabState.delete(tabId);
  void removePersistedTabState(tabId);
}

chrome.runtime.onInstalled.addListener((details) => {
  chrome.alarms.create(STATUS_ALARM, { periodInMinutes: STATUS_CHECK_INTERVAL_MINUTES });
  connectToAgentAndReceiveToken();
  void checkDeviceStatus();
  // Chrome Web Store policy requires affiliate-program use to be disclosed in the product's
  // UI, not just the store listing -- opening this on first install (not on every update) is
  // the earliest point an extension itself can show anything, since nothing in its own UI can
  // render before the user has actually installed it.
  if (details.reason === 'install') {
    void chrome.tabs.create({ url: 'https://saverlly.com/affiliate-disclosure/' });
  }
});

chrome.runtime.onStartup.addListener(() => {
  connectToAgentAndReceiveToken();
  void checkDeviceStatus();
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === STATUS_ALARM) void checkDeviceStatus();
});

chrome.tabs.onRemoved.addListener((tabId) => {
  clearTabState(tabId);
  void takePendingApply(tabId);
});

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

// Shared by onCommitted (full document navigations) and onHistoryStateUpdated (SPA route
// changes via the History API, e.g. a cart page routing to checkout without a reload)
// Both only resolve merchants and detect checkout; neither performs attribution.
async function handleTopFrameNavigation(
  details: chrome.webNavigation.WebNavigationTransitionCallbackDetails,
): Promise<void> {
  if (details.frameId !== 0) return;

  // Any top-frame navigation invalidates the previous page's checkout state, regardless of
  // whether this new page turns out dormant/non-merchant/coupon-less. Clear it unconditionally
  // rather than only in the branches below, so stale state can't linger past a dormant check.
  clearTabState(details.tabId);
  setBadge(details.tabId, null);

  if (await isDormant()) return;

  let hostname: string;
  try {
    hostname = new URL(details.url).hostname;
  } catch {
    return;
  }

  const merchant = await resolveMerchant(hostname);
  if (!merchant || !merchant.active) return;

  // Visiting a merchant only detects checkout. Attribution requires a popup Apply click.

  if (!merchant.coupons.length || !merchant.checkoutRecipe) return;

  try {
    await injectWithContext(
      details.tabId,
      ['content-scripts/checkout-detector.js'],
      { merchantId: merchant.id, recipe: merchant.checkoutRecipe },
    );
  } catch {
    // Restricted page (chrome://, webstore) or tab closed mid-navigation. Ignore.
  }
}

chrome.webNavigation.onCommitted.addListener((details) => handleTopFrameNavigation(details));
chrome.webNavigation.onHistoryStateUpdated.addListener((details) => handleTopFrameNavigation(details));

async function onCheckoutConfirmed(tabId: number, merchantId: string, referrer: string): Promise<void> {
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

  const suppressed = await checkStepDown(merchant.domain, tab.url, merchant.affiliateUrlParamKey, referrer);
  saveTabState(tabId, {
    merchantId: merchant.id,
    merchantName: merchant.name,
    coupons: merchant.coupons,
    suppressedStepdown: suppressed,
    applyProgress: null,
    applyResult: null,
  });

  const pending = await takePendingApply(tabId);
  if (pending && pending.merchantId === merchant.id && pending.expiresAt > Date.now() &&
      pending.checkoutPath === new URL(tab.url).origin + new URL(tab.url).pathname) {
    await triggerApply(tabId, true);
    return;
  }

  if (suppressed) {
    // A competing affiliate's tracking is already active. Stay paused and require the
    // user to explicitly override it via the popup rather than silently applying over it.
    await reportCouponTestEvent({ merchantId: merchant.id, result: 'suppressed_stepdown' });
    setBadge(tabId, BADGE_SUPPRESSED);
    return;
  }

  setBadge(tabId, BADGE_READY);
  try {
    // Best-effort only: Chrome may refuse this outside a user gesture / focused window.
    // The badge above is the guaranteed fallback affordance either way.
    await (chrome.action as unknown as { openPopup?: () => Promise<void> }).openPopup?.();
  } catch {
    // ignored. See comment above
  }

  // No competing affiliate link. Surface the popup's "Apply Coupons" prompt and wait for the
  // user to click it (APPLY_BEST_COUPON), rather than applying automatically.
}

async function triggerApply(tabId: number, continuingAfterRedirect = false): Promise<boolean> {
  if (await isDormant()) return false;

  const state = await loadTabState(tabId);
  const tab = await chrome.tabs.get(tabId).catch(() => undefined);
  if (!state || !tab?.url) return false;
  if (state.applyProgress && !state.applyResult) return true;

  // Reset any stale progress/result from a prior run (e.g. a manual "Try Coupons Again")
  // so a popup opened mid-run doesn't show the previous attempt's outcome.
  saveTabState(tabId, { ...state, suppressedStepdown: false, applyProgress: null, applyResult: null });

  if (!state.coupons.length) {
    const result: CouponApplyResultMessage = {
      type: 'COUPON_APPLY_RESULT',
      merchantId: state.merchantId,
      couponId: null,
      code: null,
      result: 'no_coupons_available',
      isFinal: true,
    };
    saveTabState(tabId, { ...state, applyProgress: null, applyResult: result });
    chrome.runtime.sendMessage({ type: 'APPLY_DONE', tabId, result }).catch(() => {});
    void reportCouponTestEvent({ merchantId: state.merchantId, result: 'no_coupons_available' }).catch(() => {});
    return true;
  }

  let hostname: string;
  try {
    hostname = new URL(tab.url).hostname;
  } catch {
    return false;
  }

  const merchant = await resolveMerchant(hostname);
  if (!merchant?.active || merchant.id !== state.merchantId || !merchant.checkoutRecipe) return false;

  if (!continuingAfterRedirect) {
    const redirected = await runAttribution(tabId, tab.url, merchant, async url => {
      const target = new URL(url);
      await setPendingApply(tabId, { merchantId: merchant.id, checkoutPath: target.origin + target.pathname, expiresAt: Date.now() + 60000 });
    });
    if (redirected) return true;
  }

  await injectWithContext(
    tabId,
    ['content-scripts/coupon-applier.js'],
    { merchantId: merchant.id, recipe: merchant.checkoutRecipe, coupons: state.coupons },
  );
  return true;
}

async function getActiveTabId(): Promise<number | undefined> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab?.id;
}

// Content scripts (coupon-applier.js) run in the tab, not the popup. Sender.tab.id is how
// their progress/result messages get attributed back to the right tab's state, so a popup
// that (re)opens mid-run or after completion can restore the real state instead of "idle".
async function patchTabState(sender: chrome.runtime.MessageSender, patch: Partial<TabCheckoutState>): Promise<void> {
  const tabId = sender.tab?.id;
  if (tabId === undefined) return;
  const state = await loadTabState(tabId);
  if (!state) return;
  saveTabState(tabId, { ...state, ...patch });
}

async function handleMessage(message: ExtensionMessage, sender: chrome.runtime.MessageSender): Promise<unknown> {
  switch (message.type) {
    case 'CHECKOUT_CONFIRMED': {
      const tabId = sender.tab?.id;
      if (tabId === undefined) return;
      await onCheckoutConfirmed(tabId, message.merchantId, message.referrer);
      return;
    }
    case 'COUPON_APPLY_RESULT': {
      if (sender.tab?.id === undefined) return;
      const state = await loadTabState(sender.tab.id);
      if (!state || state.merchantId !== message.merchantId) return;
      // A successful trial is temporary. Only the final chosen code counts as
      // applied savings; otherwise testing three valid codes triples lifetime savings.
      if (!message.isFinal && message.result === 'applied') return;
      // Checkout completion must not depend on the reporting server being reachable.
      if (message.isFinal) {
        await patchTabState(sender, { applyResult: message });
        chrome.runtime.sendMessage({ type: 'APPLY_DONE', tabId: sender.tab.id, result: message }).catch(() => {});
      }
      await reportCouponTestEvent({
        merchantId: message.merchantId,
        couponId: message.couponId ?? undefined,
        result: message.result,
        discountAmount: message.discountAmount,
      });
      // Only the last attempt in the sequence should flip the popup out of "applying"
      // intermediate failures keep reporting to the backend but must not surface yet.
      return;
    }
    case 'COUPON_APPLY_PROGRESS': {
      if (sender.tab?.id === undefined) return;
      await patchTabState(sender, { applyProgress: message });
      // Fire-and-forget relay. Popup listens for this to render live apply progress.
      chrome.runtime.sendMessage({ ...message, tabId: sender.tab.id }).catch(() => {});
      return;
    }
    case 'GET_TAB_STATE': {
      if (await isDormant()) return null;
      const tabId = await getActiveTabId();
      return tabId !== undefined ? await loadTabState(tabId) : null;
    }
    case 'APPLY_BEST_COUPON': {
      const tabId = await getActiveTabId();
      return { started: tabId !== undefined ? await triggerApply(tabId) : false };
    }
    case 'GET_LIFETIME_SAVED': {
      try {
        return await fetchLifetimeSaved();
      } catch {
        return null;
      }
    }
    case 'GET_ACTIVE_PROMOTIONS': {
      // A dormant extension shows nothing at all, promos included. Same fail-safe posture as
      // GET_TAB_STATE. Any error degrades to "no promos" rather than breaking the popup.
      if (await isDormant()) return [];
      try {
        return await fetchActivePromotions();
      } catch {
        return [];
      }
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
