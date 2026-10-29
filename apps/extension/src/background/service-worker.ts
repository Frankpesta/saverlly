import type { PublicMerchant } from "@saverlly/shared-types";
import {
  fetchActivePromotions,
  fetchLifetimeSaved,
  fetchMerchantByDomain,
} from "../lib/api-client";
import { runAttribution } from "../lib/attribution";
import { usableCoupons } from "../lib/cart-total";
import {
  flushCouponEvents,
  queueCouponTestEvent as reportCouponTestEvent,
} from "../lib/event-queue";
import {
  STATUS_CHECK_INTERVAL_MINUTES,
  MERCHANT_CACHE_TTL_MS,
  MERCHANT_MISS_CACHE_TTL_MS,
} from "../lib/config";
import type {
  CouponApplyResultMessage,
  ExtensionMessage,
  InjectedCheckoutContext,
  StoreSetupMessage,
  StoreSetupSubmitResult,
  StoreSetupTabContext,
  StoreSetupTabMessage,
  StoreSetupTabStatus,
  TabCheckoutState,
} from "../lib/messages";
import { STORE_SETUP_OVERLAY_CLOSE } from "../lib/messages";
import { connectToAgentAndReceiveToken } from "../lib/native-messaging";
import {
  checkStepDown,
  isAffiliateLanding,
  overrideStandDown,
  recordAffiliateLanding,
} from "../lib/step-down-check";
import { checkDeviceStatus } from "../lib/status-check";
import { activateReviewer } from "../lib/reviewer-access";
import {
  endStoreSetup,
  fetchStoreSetupSession,
  getStoreSetup,
  redeemStoreSetupCode,
  StoreSetupEndedError,
  submitStoreSetupRecipe,
  toStoreSetupStatus,
} from "../lib/store-setup";
import {
  activeStoreSetupTab,
  clearStoreSetupTabs,
  isOnStoreDomain,
  saveStoreSetupProgress,
  startStoreSetupOnTab,
  stopStoreSetupOnTab,
  type StoreSetupTab,
} from "../lib/store-setup-tabs";
import { getReviewerAccess } from "../lib/storage";
import {
  getCachedMerchant,
  getPersistedTabState,
  isDormant,
  peekPendingApply,
  removePersistedTabState,
  setCachedMerchant,
  setPersistedTabState,
  setPendingApply,
  takePendingApply,
} from "../lib/storage";

const STATUS_ALARM = "saverlly-status-check";
const RECOVERY_ALARM = "saverlly-recovery";
let initializing: Promise<void> | undefined;
const navigationVersions = new Map<number, number>();
const starting = new Map<number, Promise<boolean>>();
const messageQueues = new Map<number, Promise<unknown>>();
// Where each top-frame navigation started (before server redirects) and the last committed
// document per tab. Together they reveal an affiliate redirect hop (network -> merchant) that
// leaves no trace in the merchant URL. Lost on a worker recycle, which only costs the
// redirect-hop signal for navigations that were already in flight.
const navigationStarts = new Map<number, string>();
const lastCommittedUrls = new Map<number, string>();
// Tabs whose checkout became ready while they were in the background. Their popup opens when
// the shopper actually looks at them, never over whatever tab is in front at the time.
const AUTO_POPUP_PENDING_KEY = "autoPopupPending";
// A run killed by a full page load (store reloaded the checkout, shopper navigated) can never
// report its own result. Its failure is kept here until the checkout is detected again, so the
// popup shows what happened instead of a fresh "Apply Coupons" prompt.
const interruptedRuns = new Map<number, CouponApplyResultMessage>();
const subframeScanTimers = new Map<number, ReturnType<typeof setTimeout>>();

function ensureAlarms(): void {
  chrome.alarms.create(STATUS_ALARM, {
    periodInMinutes: STATUS_CHECK_INTERVAL_MINUTES,
  });
  chrome.alarms.create(RECOVERY_ALARM, { periodInMinutes: 1 });
}

async function initialize(): Promise<void> {
  if (initializing) return initializing;
  initializing = (async () => {
    ensureAlarms();
    await connectToAgentAndReceiveToken();
    if (await checkDeviceStatus()) {
      const tabs = await chrome.tabs.query({});
      for (const tab of tabs)
        if (tab.id !== undefined && tab.url?.startsWith("http"))
          void detectTab(tab.id, tab.url);
      void flushCouponEvents();
    }
  })()
    .catch(() => {})
    .finally(() => {
      initializing = undefined;
    });
  return initializing;
}
const BADGE_READY = { text: "%", color: "#16A34A" };
const BADGE_SUPPRESSED = { text: "!", color: "#9CA3AF" };

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
  chrome.runtime
    .sendMessage({ type: "CHECKOUT_STATE_CHANGED", tabId, state })
    .catch(() => {});
}

function clearTabState(tabId: number): void {
  tabState.delete(tabId);
  void removePersistedTabState(tabId);
  chrome.runtime
    .sendMessage({ type: "CHECKOUT_STATE_CHANGED", tabId, state: null })
    .catch(() => {});
}

chrome.runtime.onInstalled.addListener((details) => {
  void initialize();
  // Chrome Web Store policy requires affiliate-program use to be disclosed in the product's
  // UI, not just the store listing -- opening this on first install (not on every update) is
  // the earliest point an extension itself can show anything, since nothing in its own UI can
  // render before the user has actually installed it.
  if (details.reason === "install") {
    void chrome.tabs.create({
      url: "https://saverlly.com/affiliate-disclosure/",
    });
  }
});

chrome.runtime.onStartup.addListener(() => {
  void initialize();
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === STATUS_ALARM) void checkDeviceStatus();
  if (alarm.name === RECOVERY_ALARM) {
    void getReviewerAccess().then((review) => { if (review) void checkDeviceStatus(); });
    void isDormant().then((dormant) => {
      if (dormant) void initialize();
      else void flushCouponEvents();
    });
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  navigationVersions.delete(tabId);
  interruptedRuns.delete(tabId);
  clearTimeout(subframeScanTimers.get(tabId));
  subframeScanTimers.delete(tabId);
  navigationStarts.delete(tabId);
  lastCommittedUrls.delete(tabId);
  void setAutoPopupPending(tabId, false);
  clearTabState(tabId);
  void takePendingApply(tabId);
  void stopStoreSetupOnTab(tabId);
});

chrome.storage?.onChanged?.addListener((changes, area) => {
  if (area === "local" && changes.storeSetupSession) {
    // Setup ended, expired or moved to another store: every tab it paused goes back to normal.
    const next = changes.storeSetupSession.newValue as { sessionId?: string } | undefined;
    void clearStoreSetupTabs(next?.sessionId)
      .then((ended) => Promise.all(ended.map(endSetupOnTab)))
      .catch(() => {});
  }
  if (area === "local" && (changes.deviceToken || changes.reviewerAccess)) {
    // A reviewer and an agent may use this installation at different times. Never
    // show one identity's completed checkout as a result belonging to the other.
    for (const tabId of tabState.keys()) {
      clearTabState(tabId);
      void takePendingApply(tabId);
    }
  }
  if (area !== "local" || !changes.dormant) return;
  const dormant = changes.dormant.newValue === true;
  chrome.runtime
    .sendMessage({ type: "DEVICE_STATUS_CHANGED", dormant })
    .catch(() => {});
  void chrome.tabs.query({}).then((tabs) => {
    for (const tab of tabs) {
      if (tab.id === undefined) continue;
      if (dormant) {
        clearTabState(tab.id);
        setBadge(tab.id, null);
      } else if (tab.url?.startsWith("http"))
        void detectTab(tab.id, tab.url).catch(() => {});
    }
  });
});

async function getMerchantCached(
  domain: string,
  fresh = false,
): Promise<PublicMerchant | null> {
  const cached = await getCachedMerchant(domain);
  const usable =
    cached?.merchant?.active && usableCoupons(cached.merchant.coupons).length;
  if (
    !fresh &&
    cached &&
    Date.now() - cached.fetchedAt <
      (usable ? MERCHANT_CACHE_TTL_MS : MERCHANT_MISS_CACHE_TTL_MS)
  ) {
    return cached.merchant;
  }
  const merchant = await fetchMerchantByDomain(domain);
  await setCachedMerchant(domain, { merchant, fetchedAt: Date.now() });
  return merchant;
}

async function resolveMerchant(
  hostname: string,
  fresh = false,
): Promise<PublicMerchant | null> {
  const candidates = Array.from(
    new Set([hostname, hostname.replace(/^www\./, "")]),
  );
  const labels = hostname.split(".");
  while (labels.length > 2) {
    labels.shift();
    if (!candidates.includes(labels.join(".")))
      candidates.push(labels.join("."));
  }
  for (const domain of candidates) {
    const merchant = await getMerchantCached(domain, fresh);
    if (merchant) return merchant;
  }
  return null;
}

function setBadge(
  tabId: number,
  state: { text: string; color: string } | null,
): void {
  chrome.action.setBadgeText({ tabId, text: state?.text ?? "" });
  if (state)
    chrome.action.setBadgeBackgroundColor({ tabId, color: state.color });
}

async function injectWithContext(
  tabId: number,
  files: string[],
  context: InjectedCheckoutContext,
  frameId?: number,
  documentId?: string,
): Promise<void> {
  const target = documentId
    ? { tabId, documentIds: [documentId] }
    : frameId === undefined
      ? { tabId, allFrames: true }
      : { tabId, frameIds: [frameId] };
  await chrome.scripting.executeScript({
    target,
    func: (ctx) => {
      (window as unknown as { __SAVERLLY__?: unknown }).__SAVERLLY__ = ctx;
    },
    args: [context],
  });
  await chrome.scripting.executeScript({ target, files });
}

function checkoutPath(url: string): string {
  const parsed = new URL(url);
  return parsed.origin + parsed.pathname + parsed.hash;
}

async function detectTab(
  tabId: number,
  url: string,
  fresh = false,
): Promise<void> {
  if (!url.startsWith("http") || (await isDormant())) return;
  if (await activeStoreSetupTab(tabId, url)) return;
  const version = navigationVersions.get(tabId);
  const merchant = await resolveMerchant(new URL(url).hostname, fresh);
  if (
    !merchant?.active ||
    !usableCoupons(merchant.coupons).length ||
    !merchant.checkoutRecipe ||
    version !== navigationVersions.get(tabId)
  )
    return;
  try {
    await injectWithContext(tabId, ["content-scripts/checkout-detector.js"], {
      merchantId: merchant.id,
      recipe: merchant.checkoutRecipe,
      checkoutUrl: url,
    });
  } catch {
    /* Tab closed or restricted frame. */
  }
}

// Shared by onCommitted (full document navigations) and onHistoryStateUpdated (SPA route
// changes via the History API, e.g. a cart page routing to checkout without a reload)
// Both only resolve merchants and detect checkout; neither performs attribution.
async function handleTopFrameNavigation(
  details: chrome.webNavigation.WebNavigationTransitionCallbackDetails,
  sameDocument = false,
): Promise<void> {
  if (details.frameId !== 0) return;
  // Leaving the store's site ends setup on this tab; on it, setup carries on across pages.
  const settingUp = !!(await activeStoreSetupTab(details.tabId, details.url));

  if (!sameDocument) {
    const qualifiers = details.transitionQualifiers ?? [];
    const redirectedFrom = qualifiers.includes("server_redirect")
      ? navigationStarts.get(details.tabId)
      : qualifiers.includes("client_redirect")
        ? lastCommittedUrls.get(details.tabId)
        : undefined;
    navigationStarts.delete(details.tabId);
    lastCommittedUrls.set(details.tabId, details.url);
    // An admin's setup visit must not leave a stand-down that pauses shoppers on this store.
    if (!settingUp)
      void noteAffiliateLanding(details.url, redirectedFrom).catch(() => {});
  }

  const previous = await loadTabState(details.tabId);
  // Only a new document kills the coupon-applier; a same-document route change is noticed by
  // the script itself, which then reports checkout_changed on its own.
  let interrupted: CouponApplyResultMessage | null = null;
  if (!sameDocument) {
    const pending = await peekPendingApply(details.tabId);
    const landed = new URL(details.url);
    if (pending) {
      // Attribution redirect in progress. It resumes on its own only if it lands back on the
      // same checkout in time; anything else would leave the popup testing forever.
      if (
        pending.expiresAt <= Date.now() ||
        pending.checkoutPath !== landed.origin + landed.pathname
      ) {
        await takePendingApply(details.tabId);
        interrupted = interruptedResult(pending.merchantId);
      }
    } else if (previous?.runId && !previous.applyResult) {
      interrupted = interruptedResult(previous.merchantId);
    }
  }
  if (
    sameDocument &&
    previous?.checkoutUrl &&
    checkoutPath(previous.checkoutUrl) === checkoutPath(details.url)
  )
    return;
  navigationVersions.set(
    details.tabId,
    (navigationVersions.get(details.tabId) ?? 0) + 1,
  );

  // Any top-frame navigation invalidates the previous page's checkout state, regardless of
  // whether this new page turns out dormant/non-merchant/coupon-less. Clear it unconditionally
  // rather than only in the branches below, so stale state can't linger past a dormant check.
  clearTabState(details.tabId);
  setBadge(details.tabId, null);
  void setAutoPopupPending(details.tabId, false);
  if (interrupted) {
    interruptedRuns.set(details.tabId, interrupted);
    chrome.runtime
      .sendMessage({ type: "APPLY_DONE", tabId: details.tabId, result: interrupted })
      .catch(() => {});
  }

  if (await isDormant()) return;

  await detectTab(details.tabId, details.url);
}

function interruptedResult(merchantId: string): CouponApplyResultMessage {
  return {
    type: "COUPON_APPLY_RESULT",
    merchantId,
    couponId: null,
    code: null,
    result: "failed",
    isFinal: true,
    failureReason: "checkout_changed",
  };
}

// Stand-down evidence has to be captured on the landing page itself (see
// step-down-check.ts' isAffiliateLanding). Only merchants are recorded, keyed by their domain,
// so the checkout reached several pages later is still paused.
async function noteAffiliateLanding(
  url: string,
  redirectedFrom: string | undefined,
): Promise<void> {
  if (!url.startsWith("http")) return;
  // Cheap pre-check with no merchant config, so ordinary browsing never costs a lookup.
  if (!isAffiliateLanding(url, redirectedFrom)) return;
  const merchant = await resolveMerchant(new URL(url).hostname);
  if (!merchant) return;
  if (
    !isAffiliateLanding(url, redirectedFrom, {
      key: merchant.affiliateUrlParamKey,
      value: merchant.affiliateUrlParamValue,
      subIdKey: merchant.affiliateSubIdParamKey,
    })
  )
    return;
  await recordAffiliateLanding(merchant.domain);
}

// Each new page on the store gets the setup panel again; a same-document route change keeps
// the one already there.
chrome.webNavigation.onDOMContentLoaded?.addListener((details) => {
  if (details.frameId !== 0) return;
  void activeStoreSetupTab(details.tabId, details.url)
    .then((tab) => (tab ? injectSetupPanel(details.tabId) : undefined))
    .catch(() => {});
});

chrome.webNavigation.onBeforeNavigate?.addListener((details) => {
  if (details.frameId === 0) navigationStarts.set(details.tabId, details.url);
});

chrome.webNavigation.onCommitted.addListener((details) =>
  handleTopFrameNavigation(details).catch(() => {}),
);
chrome.webNavigation.onHistoryStateUpdated.addListener((details) =>
  handleTopFrameNavigation(details, true).catch(() => {}),
);
chrome.webNavigation.onReferenceFragmentUpdated?.addListener((details) => {
  void handleTopFrameNavigation(details, true).catch(() => {});
});
// Some checkouts render their coupon form in an iframe that loads after the top frame, so a
// late subframe gets the detector too. Ad-heavy pages load dozens of iframes, so the scans are
// coalesced per tab and skipped once the checkout is already confirmed.
chrome.webNavigation.onCompleted?.addListener((details) => {
  if (details.frameId === 0) return;
  clearTimeout(subframeScanTimers.get(details.tabId));
  subframeScanTimers.set(
    details.tabId,
    setTimeout(() => {
      subframeScanTimers.delete(details.tabId);
      void loadTabState(details.tabId)
        .then(async (state) => {
          if (state) return;
          const tab = await chrome.tabs.get(details.tabId);
          if (tab.url) return detectTab(details.tabId, tab.url);
        })
        .catch(() => {});
    }, 750),
  );
});

async function onCheckoutConfirmed(
  tabId: number,
  merchantId: string,
  referrer: string,
  sender: chrome.runtime.MessageSender,
): Promise<void> {
  if (await isDormant()) return;
  if (sender.documentId && chrome.webNavigation.getFrame) {
    const frame = await chrome.webNavigation
      .getFrame({ tabId, frameId: sender.frameId ?? 0 })
      .catch(() => null);
    if (!frame || frame.documentId !== sender.documentId) return;
  }

  const tab = await chrome.tabs.get(tabId).catch(() => undefined);
  if (!tab?.url) return;

  if (await activeStoreSetupTab(tabId, tab.url)) return;

  let hostname: string;
  try {
    hostname = new URL(tab.url).hostname;
  } catch {
    return;
  }

  const merchant = await resolveMerchant(hostname);
  if (!merchant || merchant.id !== merchantId) return;
  const previous = await loadTabState(tabId);
  if (
    previous?.merchantId === merchantId &&
    previous.checkoutUrl === checkoutPath(tab.url) &&
    (previous.applyProgress ||
      previous.applyResult ||
      (sender.documentId && previous.documentId === sender.documentId))
  )
    return;

  const coupons = usableCoupons(merchant.coupons);
  const interrupted = interruptedRuns.get(tabId);
  interruptedRuns.delete(tabId);
  const suppressed = await checkStepDown(
    merchant.domain,
    tab.url,
    merchant.affiliateUrlParamKey,
    referrer,
    merchant.affiliateUrlParamValue,
  );
  saveTabState(tabId, {
    checkoutUrl: checkoutPath(tab.url),
    frameId: sender.frameId ?? 0,
    documentId: sender.documentId,
    merchantId: merchant.id,
    merchantName: merchant.name,
    coupons,
    suppressedStepdown: suppressed,
    applyProgress: null,
    applyResult:
      interrupted?.merchantId === merchant.id ? interrupted : null,
  });

  const pending = await takePendingApply(tabId);
  if (
    pending &&
    pending.merchantId === merchant.id &&
    pending.expiresAt > Date.now() &&
    pending.checkoutPath === new URL(tab.url).origin + new URL(tab.url).pathname
  ) {
    await triggerApply(tabId, true);
    return;
  }

  if (interrupted?.merchantId === merchant.id) {
    setBadge(tabId, suppressed ? BADGE_SUPPRESSED : BADGE_READY);
    return;
  }

  if (suppressed) {
    // A competing affiliate's tracking is already active. Stay paused and require the
    // user to explicitly override it via the popup rather than silently applying over it.
    void reportCouponTestEvent({
      merchantId: merchant.id,
      result: "suppressed_stepdown",
    }).catch(() => {});
    setBadge(tabId, BADGE_SUPPRESSED);
    return;
  }

  setBadge(tabId, BADGE_READY);
  await openPopupWhenVisible(tabId);

  // No competing affiliate link. Surface the popup's "Apply Coupons" prompt and wait for the
  // user to click it (APPLY_BEST_COUPON), rather than applying automatically.
}

async function setAutoPopupPending(
  tabId: number,
  pending: boolean,
): Promise<void> {
  const session = chrome.storage?.session;
  if (!session) return;
  const stored = (await session.get(AUTO_POPUP_PENDING_KEY))[
    AUTO_POPUP_PENDING_KEY
  ] as number[] | undefined;
  if (!pending && !stored?.includes(tabId)) return;
  const next = new Set(stored ?? []);
  if (pending) next.add(tabId);
  else next.delete(tabId);
  await session.set({ [AUTO_POPUP_PENDING_KEY]: [...next] });
}

async function isAutoPopupPending(tabId: number): Promise<boolean> {
  const session = chrome.storage?.session;
  if (!session) return false;
  const stored = (await session.get(AUTO_POPUP_PENDING_KEY))[
    AUTO_POPUP_PENDING_KEY
  ] as number[] | undefined;
  return !!stored?.includes(tabId);
}

// chrome.action.openPopup() opens over whichever window is focused, regardless of which tab
// asked. Checkout detection also runs in background tabs (startup scan, recovery alarm, a cart
// left open), so opening unconditionally put the popup over YouTube and other unrelated pages.
// Only open it while the checkout tab is the one being looked at; otherwise defer until it is.
async function openPopupWhenVisible(tabId: number): Promise<void> {
  const tab = await chrome.tabs.get(tabId).catch(() => undefined);
  const window = tab?.active
    ? await chrome.windows?.get(tab.windowId).catch(() => undefined)
    : undefined;
  if (!tab?.active || !window?.focused) {
    await setAutoPopupPending(tabId, true);
    return;
  }
  await setAutoPopupPending(tabId, false);
  const openPopup = (
    chrome.action as unknown as {
      openPopup?: (options?: { windowId?: number }) => Promise<void>;
    }
  ).openPopup;
  if (!openPopup) return;
  // Chrome refuses openPopup() while the checkout is still settling (focus in a page dialog or
  // the omnibox, another popup closing, the window mid-activation), and a single refusal used
  // to cost the shopper the popup for that checkout. Retry briefly, then leave it pending so
  // the next tab switch or window focus tries again. The badge stays as the fallback throughout.
  for (const delay of POPUP_RETRY_DELAYS_MS) {
    if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
    if (delay && !(await stillAwaitingPopup(tabId))) return;
    try {
      await openPopup({ windowId: tab.windowId });
      return;
    } catch {
      // retried below
    }
  }
  await setAutoPopupPending(tabId, true);
}

const POPUP_RETRY_DELAYS_MS = [0, 500, 1500, 3000];

// The retries above must not open the popup over a different tab, or after the shopper has
// already opened it themselves and started applying.
async function stillAwaitingPopup(tabId: number): Promise<boolean> {
  const tab = await chrome.tabs.get(tabId).catch(() => undefined);
  if (!tab?.active) return false;
  const state = await loadTabState(tabId);
  return !!state && !state.applyProgress && !state.applyResult;
}

// A deferred popup only makes sense while that checkout is still waiting for the shopper.
async function openDeferredPopup(tabId: number): Promise<void> {
  if (!(await isAutoPopupPending(tabId))) return;
  const state = await loadTabState(tabId);
  if (
    (await activeStoreSetupTab(tabId)) ||
    !state ||
    state.suppressedStepdown ||
    state.applyProgress ||
    state.applyResult ||
    (await isDormant())
  ) {
    await setAutoPopupPending(tabId, false);
    return;
  }
  await openPopupWhenVisible(tabId);
}

chrome.tabs.onActivated?.addListener(({ tabId }) => {
  void openDeferredPopup(tabId).catch(() => {});
});

chrome.windows?.onFocusChanged?.addListener((windowId) => {
  if (windowId === chrome.windows.WINDOW_ID_NONE) return;
  void chrome.tabs
    .query({ active: true, windowId })
    .then(([tab]) =>
      tab?.id !== undefined ? openDeferredPopup(tab.id) : undefined,
    )
    .catch(() => {});
});

function triggerApply(
  tabId: number,
  continuingAfterRedirect = false,
): Promise<boolean> {
  const pending = starting.get(tabId);
  if (pending) return pending;
  const task = startApply(tabId, continuingAfterRedirect).finally(() =>
    starting.delete(tabId),
  );
  starting.set(tabId, task);
  return task;
}

async function startApply(
  tabId: number,
  continuingAfterRedirect = false,
): Promise<boolean> {
  if (await isDormant()) return false;
  if (await getReviewerAccess() && !(await checkDeviceStatus())) return false;

  const state = await loadTabState(tabId);
  const tab = await chrome.tabs.get(tabId).catch(() => undefined);
  if (!state || !tab?.url) return false;
  if (await activeStoreSetupTab(tabId, tab.url)) return false;
  if (state.checkoutUrl && state.checkoutUrl !== checkoutPath(tab.url))
    return false;
  if (state.applyProgress && !state.applyResult) return true;
  void setAutoPopupPending(tabId, false);

  // Reset any stale progress/result from a prior run (e.g. a manual "Try Coupons Again")
  // so a popup opened mid-run doesn't show the previous attempt's outcome.
  saveTabState(tabId, {
    ...state,
    suppressedStepdown: false,
    applyProgress: null,
    applyResult: null,
  });

  if (!state.coupons.length) {
    const result: CouponApplyResultMessage = {
      type: "COUPON_APPLY_RESULT",
      merchantId: state.merchantId,
      couponId: null,
      code: null,
      result: "no_coupons_available",
      isFinal: true,
    };
    saveTabState(tabId, { ...state, applyProgress: null, applyResult: result });
    chrome.runtime
      .sendMessage({ type: "APPLY_DONE", tabId, result })
      .catch(() => {});
    void reportCouponTestEvent({
      merchantId: state.merchantId,
      result: "no_coupons_available",
    }).catch(() => {});
    return true;
  }

  let hostname: string;
  try {
    hostname = new URL(tab.url).hostname;
  } catch {
    return false;
  }

  const merchant = await resolveMerchant(hostname, true);
  if (
    !merchant?.active ||
    merchant.id !== state.merchantId ||
    !merchant.checkoutRecipe
  )
    return false;
  // Applying from the paused screen is the shopper explicitly overriding the stand-down.
  if (state.suppressedStepdown) await overrideStandDown(merchant.domain);
  const coupons = usableCoupons(merchant.coupons);
  const runId = crypto.randomUUID();
  saveTabState(tabId, {
    ...state,
    coupons,
    runId,
    suppressedStepdown: false,
    applyProgress: null,
    applyResult: null,
  });

  if (!continuingAfterRedirect && coupons.length) {
    const redirected = await runAttribution(
      tabId,
      tab.url,
      merchant,
      async (url) => {
        const target = new URL(url);
        await setPendingApply(tabId, {
          merchantId: merchant.id,
          checkoutPath: target.origin + target.pathname,
          expiresAt: Date.now() + 60000,
        });
      },
    );
    if (redirected) return true;
  }

  const currentTab = await chrome.tabs.get(tabId).catch(() => undefined);
  if (
    (await isDormant()) ||
    !currentTab?.url ||
    checkoutPath(currentTab.url) !== checkoutPath(tab.url)
  )
    return false;

  await injectWithContext(
    tabId,
    ["content-scripts/coupon-applier.js"],
    {
      merchantId: merchant.id,
      recipe: merchant.checkoutRecipe,
      coupons,
      runId,
    },
    state.frameId ?? 0,
    state.documentId,
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
async function patchTabState(
  sender: chrome.runtime.MessageSender,
  patch: Partial<TabCheckoutState>,
): Promise<void> {
  const tabId = sender.tab?.id;
  if (tabId === undefined) return;
  const state = await loadTabState(tabId);
  if (!state) return;
  saveTabState(tabId, { ...state, ...patch });
}

const STORE_SETUP_PAGES = ["options/options.html", "popup/popup.html"];

/** Only the extension's own admin-facing pages, never a content script on a store's page. */
function isStoreSetupPage(sender: chrome.runtime.MessageSender): boolean {
  if (sender.id !== chrome.runtime.id || !sender.url) return false;
  const url = sender.url.split(/[?#]/)[0];
  return STORE_SETUP_PAGES.some((page) => url === chrome.runtime.getURL(page));
}

async function handleStoreSetupMessage(
  message: StoreSetupMessage,
): Promise<unknown> {
  switch (message.type) {
    case "STORE_SETUP_REDEEM":
      try {
        return { setup: toStoreSetupStatus(await redeemStoreSetupCode(message.code)) };
      } catch (error) {
        // fetch() rejects with a TypeError when offline and a TimeoutError on timeout; neither
        // message is meant for people.
        const unreachable =
          !(error instanceof Error) ||
          error instanceof TypeError ||
          error.name === "TimeoutError";
        return {
          error: unreachable
            ? "Could not reach Saverlly. Check the connection and try again."
            : error.message,
        };
      }
    case "STORE_SETUP_STATUS": {
      const record = await getStoreSetup();
      if (record && message.verify) {
        try {
          await fetchStoreSetupSession();
        } catch (error) {
          // Ended on the backend: already cleared. Anything else (offline, timeout) is not
          // proof the session ended, so the local one stands.
          if (error instanceof StoreSetupEndedError) return { setup: null };
        }
      }
      if (!record) return { setup: null };
      if (message.tabId === undefined) return { setup: toStoreSetupStatus(record) };
      const tab = await chrome.tabs.get(message.tabId).catch(() => undefined);
      const status: StoreSetupTabStatus = {
        onStore: isOnStoreDomain(tab?.url, record.merchant.domain),
        running: !!tab?.url && !!(await activeStoreSetupTab(message.tabId, tab.url)),
      };
      return { setup: toStoreSetupStatus(record), tab: status };
    }
    case "STORE_SETUP_END":
      await endStoreSetup();
      return { ended: true };
    case "STORE_SETUP_START_TAB":
      return startSetupOnTab(message.tabId);
    case "STORE_SETUP_STOP_TAB": {
      const stopped = await stopStoreSetupOnTab(message.tabId);
      if (stopped) await endSetupOnTab(message.tabId);
      return { stopped };
    }
  }
}

/** The setup tab a message came from: only its top frame, only while setup runs there and the
 *  frame is on the store's site. Anything else (another tab, a frame, another site) is null. */
async function senderSetupTab(sender: chrome.runtime.MessageSender): Promise<StoreSetupTab | null> {
  const tabId = sender.tab?.id;
  if (sender.id !== chrome.runtime.id || tabId === undefined || sender.frameId !== 0 || !sender.url) return null;
  return activeStoreSetupTab(tabId, sender.url);
}

async function handleStoreSetupTabMessage(
  message: StoreSetupTabMessage,
  sender: chrome.runtime.MessageSender,
): Promise<unknown> {
  const tab = await senderSetupTab(sender);
  const tabId = sender.tab?.id;
  if (!tab || tabId === undefined) return null;
  switch (message.type) {
    case "STORE_SETUP_TAB_CONTEXT": {
      const setup = await getStoreSetup();
      if (!setup) return null;
      const context: StoreSetupTabContext = {
        sessionId: tab.sessionId,
        storeName: setup.merchant.name,
        domain: setup.merchant.domain,
        progress: tab.progress,
      };
      return context;
    }
    case "STORE_SETUP_TAB_PROGRESS":
      return { saved: await saveStoreSetupProgress(tabId, tab.sessionId, message.progress) };
    case "STORE_SETUP_TAB_STOP":
      await stopStoreSetupOnTab(tabId);
      await resumeShopperMode(tabId);
      return { stopped: true };
    case "STORE_SETUP_TAB_SUBMIT": {
      let result: StoreSetupSubmitResult;
      try {
        await submitStoreSetupRecipe(message.payload);
        result = { ok: true };
      } catch (error) {
        const unreachable =
          !(error instanceof Error) || error instanceof TypeError || error.name === "TimeoutError";
        result = {
          ok: false,
          ended: error instanceof StoreSetupEndedError,
          error: unreachable ? "Could not reach Saverlly. Check the connection and try again." : error.message,
        };
      }
      return result;
    }
  }
}

/** Draws the setup panel on the tab's top frame. Safe to repeat: the script guards itself. */
async function injectSetupPanel(tabId: number): Promise<void> {
  await chrome.scripting
    .executeScript({ target: { tabId, frameIds: [0] }, files: ["content-scripts/store-setup.js"] })
    .catch(() => {
      // Tab closed, or a page scripts can't run on (the Web Store, a browser page).
    });
}

/** Setup has ended on a tab: take the panel down and give the tab back to shopper mode. */
async function endSetupOnTab(tabId: number): Promise<void> {
  await chrome.tabs
    .sendMessage(tabId, { type: STORE_SETUP_OVERLAY_CLOSE }, { frameId: 0 })
    .catch(() => {
      // No panel there (another page, or the tab already closed).
    });
  await resumeShopperMode(tabId);
}

async function startSetupOnTab(tabId: number): Promise<unknown> {
  const setup = await getStoreSetup();
  if (!setup)
    return { error: "Store setup has ended. Start a new one from the dashboard.", reason: "no-session" };
  const tab = await chrome.tabs.get(tabId).catch(() => undefined);
  if (!isOnStoreDomain(tab?.url, setup.merchant.domain))
    return { error: `Open ${setup.merchant.domain} in this tab first.`, reason: "wrong-site" };
  // Never interleave setup with a coupon run already working on this checkout.
  const state = await loadTabState(tabId);
  if (starting.has(tabId) || (state?.applyProgress && !state.applyResult))
    return { error: "Saverlly is trying coupons on this page. Wait for it to finish.", reason: "busy" };

  await startStoreSetupOnTab(tabId, setup);
  // Drop everything shopper mode had going on this tab, including detection still in flight.
  navigationVersions.set(tabId, (navigationVersions.get(tabId) ?? 0) + 1);
  clearTabState(tabId);
  setBadge(tabId, null);
  await setAutoPopupPending(tabId, false);
  await takePendingApply(tabId);
  await injectSetupPanel(tabId);
  return { started: true };
}

/** Back to normal on a tab whose setup ended: detect its checkout as if just navigated to. */
async function resumeShopperMode(tabId: number): Promise<void> {
  const tab = await chrome.tabs.get(tabId).catch(() => undefined);
  if (tab?.url) await detectTab(tabId, tab.url).catch(() => {});
}

async function handleMessage(
  message: ExtensionMessage,
  sender: chrome.runtime.MessageSender,
): Promise<unknown> {
  switch (message.type) {
    // From the setup panel on the tab being set up; checked against that tab.
    case "STORE_SETUP_TAB_CONTEXT":
    case "STORE_SETUP_TAB_PROGRESS":
    case "STORE_SETUP_TAB_STOP":
    case "STORE_SETUP_TAB_SUBMIT":
      return handleStoreSetupTabMessage(message, sender);
    // From Saverlly's own pages only.
    case "STORE_SETUP_REDEEM":
    case "STORE_SETUP_STATUS":
    case "STORE_SETUP_END":
    case "STORE_SETUP_START_TAB":
    case "STORE_SETUP_STOP_TAB":
      if (!isStoreSetupPage(sender)) return { error: "Store setup is only available from Saverlly's options page." };
      return handleStoreSetupMessage(message);
    case "ACTIVATE_REVIEWER": {
      if (sender.tab || sender.id !== chrome.runtime.id || sender.url !== chrome.runtime.getURL("popup/popup.html")) return { error: "Open Saverlly to enter your access code." };
      try {
        await activateReviewer(message.code);
        await initialize();
        return { activated: !(await isDormant()) };
      } catch (error) {
        return { error: error instanceof Error ? error.message : "Could not activate reviewer access." };
      }
    }
    case "CHECKOUT_CONFIRMED": {
      const tabId = sender.tab?.id;
      if (tabId === undefined) return;
      await onCheckoutConfirmed(
        tabId,
        message.merchantId,
        message.referrer,
        sender,
      );
      return;
    }
    case "COUPON_APPLY_RESULT": {
      if (sender.tab?.id === undefined) return;
      const state = await loadTabState(sender.tab.id);
      if (!state || state.merchantId !== message.merchantId) return;
      if (state.runId && state.runId !== message.runId) return;
      if (state.documentId && sender.documentId !== state.documentId) return;
      // A successful trial is temporary. Only the final chosen code counts as
      // applied savings; otherwise testing three valid codes triples lifetime savings.
      // Checkout completion must not depend on the reporting server being reachable.
      if (message.isFinal) {
        await patchTabState(sender, { applyResult: message });
        chrome.runtime
          .sendMessage({
            type: "APPLY_DONE",
            tabId: sender.tab.id,
            result: message,
          })
          .catch(() => {});
      }
      await reportCouponTestEvent({
        merchantId: message.merchantId,
        couponId: message.couponId ?? undefined,
        result:
          !message.isFinal && message.result === "applied"
            ? "valid"
            : message.result,
        isFinal: message.isFinal,
        discountAmount:
          message.isFinal && message.result === "applied"
            ? (message.incrementalSavings ?? message.discountAmount)
            : message.discountAmount,
      });
      // Only the last attempt in the sequence should flip the popup out of "applying"
      // intermediate failures keep reporting to the backend but must not surface yet.
      return;
    }
    case "COUPON_APPLY_PROGRESS": {
      if (sender.tab?.id === undefined) return;
      const state = await loadTabState(sender.tab.id);
      if (
        !state ||
        state.applyResult ||
        (state.runId && state.runId !== message.runId)
      )
        return;
      if (state.documentId && sender.documentId !== state.documentId) return;
      await patchTabState(sender, { applyProgress: message });
      // Fire-and-forget relay. Popup listens for this to render live apply progress.
      chrome.runtime
        .sendMessage({ ...message, tabId: sender.tab.id })
        .catch(() => {});
      return;
    }
    case "GET_TAB_STATE": {
      if (await isDormant()) return null;
      const tabId = await getActiveTabId();
      if (tabId !== undefined && (await activeStoreSetupTab(tabId))) return null;
      if (tabId !== undefined && !(await loadTabState(tabId))) {
        const tab = await chrome.tabs.get(tabId).catch(() => undefined);
        if (tab?.url) await detectTab(tabId, tab.url, true);
      }
      return tabId !== undefined ? await loadTabState(tabId) : null;
    }
    case "APPLY_BEST_COUPON": {
      const tabId = await getActiveTabId();
      return {
        started: tabId !== undefined ? await triggerApply(tabId) : false,
      };
    }
    case "GET_LIFETIME_SAVED": {
      try {
        return await fetchLifetimeSaved();
      } catch {
        return null;
      }
    }
    case "GET_EXTENSION_STATUS": {
      if (await getReviewerAccess()) await checkDeviceStatus();
      if (await isDormant()) void initialize();
      return { dormant: await isDormant() };
    }
    case "GET_ACTIVE_PROMOTIONS": {
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

chrome.runtime.onMessage.addListener(
  (message: ExtensionMessage, sender, sendResponse) => {
    // Serialize tab-originated state updates so a late progress write cannot erase a result.
    const tabId = sender.tab?.id;
    const task =
      tabId === undefined
        ? handleMessage(message, sender)
        : (messageQueues.get(tabId) ?? Promise.resolve())
            .catch(() => {})
            .then(() => handleMessage(message, sender));
    if (tabId !== undefined) {
      messageQueues.set(tabId, task);
      void task
        .finally(() => {
          if (messageQueues.get(tabId) === task) messageQueues.delete(tabId);
        })
        .catch(() => {});
    }
    task.then(sendResponse).catch((err) => {
      console.error("[saverlly] message handling failed", err);
      sendResponse(undefined);
    });
    return true; // keep the message channel open for the async sendResponse above
  },
);
