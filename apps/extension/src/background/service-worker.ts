import type { PublicMerchant } from "@saverlly/shared-types";
import {
  fetchActivePromotions,
  fetchLifetimeSaved,
  fetchMerchantByDomain,
} from "../lib/api-client";
import { runAttribution } from "../lib/attribution";
import {
  flushCouponEvents,
  queueCouponTestEvent as reportCouponTestEvent,
} from "../lib/event-queue";
import {
  STATUS_CHECK_INTERVAL_MINUTES,
  MERCHANT_CACHE_TTL_MS,
} from "../lib/config";
import type {
  CouponApplyResultMessage,
  ExtensionMessage,
  InjectedCheckoutContext,
  TabCheckoutState,
} from "../lib/messages";
import { connectToAgentAndReceiveToken } from "../lib/native-messaging";
import { checkStepDown } from "../lib/step-down-check";
import { checkDeviceStatus } from "../lib/status-check";
import { activateReviewer } from "../lib/reviewer-access";
import { getReviewerAccess } from "../lib/storage";
import {
  getCachedMerchant,
  getPersistedTabState,
  isDormant,
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
  clearTabState(tabId);
  void takePendingApply(tabId);
});

chrome.storage?.onChanged?.addListener((changes, area) => {
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
  if (
    !fresh &&
    cached &&
    Date.now() - cached.fetchedAt < MERCHANT_CACHE_TTL_MS
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
  const version = navigationVersions.get(tabId);
  const merchant = await resolveMerchant(new URL(url).hostname, fresh);
  if (
    !merchant?.active ||
    !merchant.coupons.length ||
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

  const previous = await loadTabState(details.tabId);
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

  if (await isDormant()) return;

  await detectTab(details.tabId, details.url);
}

chrome.webNavigation.onCommitted.addListener((details) =>
  handleTopFrameNavigation(details).catch(() => {}),
);
chrome.webNavigation.onHistoryStateUpdated.addListener((details) =>
  handleTopFrameNavigation(details, true).catch(() => {}),
);
chrome.webNavigation.onReferenceFragmentUpdated?.addListener((details) => {
  void handleTopFrameNavigation(details, true).catch(() => {});
});
chrome.webNavigation.onCompleted?.addListener((details) => {
  if (details.frameId === 0) return;
  void chrome.tabs
    .get(details.tabId)
    .then((tab) => {
      if (tab.url) return detectTab(details.tabId, tab.url);
    })
    .catch(() => {});
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
    coupons: merchant.coupons,
    suppressedStepdown: suppressed,
    applyProgress: null,
    applyResult: null,
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
  try {
    // Best-effort only: Chrome may refuse this outside a user gesture / focused window.
    // The badge above is the guaranteed fallback affordance either way.
    await (
      chrome.action as unknown as { openPopup?: () => Promise<void> }
    ).openPopup?.();
  } catch {
    // ignored. See comment above
  }

  // No competing affiliate link. Surface the popup's "Apply Coupons" prompt and wait for the
  // user to click it (APPLY_BEST_COUPON), rather than applying automatically.
}

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
  if (state.checkoutUrl && state.checkoutUrl !== checkoutPath(tab.url))
    return false;
  if (state.applyProgress && !state.applyResult) return true;

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
  const coupons = merchant.coupons.filter(
    (c) => c.active && (!c.expiresAt || Date.parse(c.expiresAt) > Date.now()),
  );
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

async function handleMessage(
  message: ExtensionMessage,
  sender: chrome.runtime.MessageSender,
): Promise<unknown> {
  switch (message.type) {
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
