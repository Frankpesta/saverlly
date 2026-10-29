import { AttributionMethod, CouponSource } from "@saverlly/shared-types";
import type { PublicMerchant } from "@saverlly/shared-types";
import type { TabCheckoutState } from "../lib/messages";

const addListenerMocks = {
  onInstalled: jest.fn(),
  onStartup: jest.fn(),
  onAlarm: jest.fn(),
  tabsOnRemoved: jest.fn(),
  onCommitted: jest.fn(),
  onHistoryStateUpdated: jest.fn(),
  onBeforeNavigate: jest.fn(),
  tabsOnActivated: jest.fn(),
  onMessage: jest.fn(),
};

// In-memory chrome.storage.session, so stand-down records and deferred popups persist
// across messages the way they do in the browser.
const sessionStore: Record<string, unknown> = {};
const sessionStorageMock = {
  get: jest.fn(async (key: string) =>
    key in sessionStore ? { [key]: sessionStore[key] } : {},
  ),
  set: jest.fn(async (items: Record<string, unknown>) => {
    Object.assign(sessionStore, items);
  }),
};

const chromeMock = {
  storage: {
    local: { get: jest.fn().mockResolvedValue({}) },
    session: sessionStorageMock,
  },
  windows: {
    WINDOW_ID_NONE: -1,
    get: jest.fn().mockResolvedValue({ focused: true }),
  },
  runtime: {
    id: "test-extension",
    getURL: (path: string) => "chrome-extension://test-extension/" + path,
    onInstalled: { addListener: addListenerMocks.onInstalled },
    onStartup: { addListener: addListenerMocks.onStartup },
    onMessage: { addListener: addListenerMocks.onMessage },
    sendMessage: jest.fn().mockResolvedValue(undefined),
  },
  alarms: {
    create: jest.fn(),
    onAlarm: { addListener: addListenerMocks.onAlarm },
  },
  tabs: {
    onRemoved: { addListener: addListenerMocks.tabsOnRemoved },
    onActivated: { addListener: addListenerMocks.tabsOnActivated },
    get: jest.fn(),
    query: jest.fn(),
    update: jest.fn(),
  },
  webNavigation: {
    onCommitted: { addListener: addListenerMocks.onCommitted },
    onHistoryStateUpdated: {
      addListener: addListenerMocks.onHistoryStateUpdated,
    },
    onBeforeNavigate: { addListener: addListenerMocks.onBeforeNavigate },
  },
  action: {
    setBadgeText: jest.fn(),
    setBadgeBackgroundColor: jest.fn(),
    openPopup: jest.fn().mockResolvedValue(undefined),
  },
  scripting: {
    executeScript: jest.fn().mockResolvedValue(undefined),
  },
  cookies: {
    getAll: jest.fn().mockResolvedValue([]),
  },
};

(globalThis as unknown as { chrome: typeof chrome }).chrome =
  chromeMock as unknown as typeof chrome;

jest.mock("../lib/api-client");
jest.mock("../lib/event-queue");
jest.mock("../lib/attribution");
jest.mock("../lib/storage");
jest.mock("../lib/native-messaging");
jest.mock("../lib/reviewer-access");
import { activateReviewer } from "../lib/reviewer-access";
jest.mock("../lib/store-setup", () => ({
  ...jest.requireActual("../lib/store-setup"),
  redeemStoreSetupCode: jest.fn(),
  getStoreSetup: jest.fn(),
  fetchStoreSetupSession: jest.fn(),
  endStoreSetup: jest.fn(),
}));
import {
  endStoreSetup,
  fetchStoreSetupSession,
  getStoreSetup,
  redeemStoreSetupCode,
  StoreSetupEndedError,
} from "../lib/store-setup";

import {
  fetchActivePromotions,
  fetchMerchantByDomain,
} from "../lib/api-client";
import { queueCouponTestEvent as reportCouponTestEvent } from "../lib/event-queue";
import { runAttribution } from "../lib/attribution";
import {
  getCachedMerchant,
  getPersistedTabState,
  isDormant,
  peekPendingApply,
  setCachedMerchant,
  setPersistedTabState,
} from "../lib/storage";

// Imported after the chrome/module mocks above are in place. The service worker
// registers its listeners as a side effect of module load.
import "./service-worker";

const mockFetchMerchantByDomain = fetchMerchantByDomain as jest.MockedFunction<
  typeof fetchMerchantByDomain
>;
const mockRunAttribution = runAttribution as jest.MockedFunction<
  typeof runAttribution
>;
const mockGetCachedMerchant = getCachedMerchant as jest.MockedFunction<
  typeof getCachedMerchant
>;
const mockSetCachedMerchant = setCachedMerchant as jest.MockedFunction<
  typeof setCachedMerchant
>;
const mockIsDormant = isDormant as jest.MockedFunction<typeof isDormant>;
const mockReportCouponTestEvent = reportCouponTestEvent as jest.MockedFunction<
  typeof reportCouponTestEvent
>;
const mockFetchActivePromotions = fetchActivePromotions as jest.MockedFunction<
  typeof fetchActivePromotions
>;
const mockGetPersistedTabState = getPersistedTabState as jest.MockedFunction<
  typeof getPersistedTabState
>;
const mockSetPersistedTabState = setPersistedTabState as jest.MockedFunction<
  typeof setPersistedTabState
>;

const merchant: PublicMerchant = {
  id: "m1",
  name: "Test Merchant",
  domain: "shop.example.com",
  attributionMethod: AttributionMethod.URL_PARAM,
  affiliateTrackingUrl: null,
  affiliateUrlParamKey: null,
  affiliateUrlParamValue: null,
  affiliateSubIdParamKey: null,
  active: true,
  checkoutRecipe: {
    couponFieldSelector: "#coupon",
    applyButtonSelector: "#apply",
    successIndicatorSelector: ".success",
    failureIndicatorSelector: ".failure",
    cartTotalSelector: ".total",
    checkoutUrlPatterns: ["/checkout"],
  },
  coupons: [
    {
      id: "c1",
      merchantId: "m1",
      code: "SAVE10",
      description: null,
      source: CouponSource.MANUAL,
      discountType: null,
      discountValue: null,
      successCount: 0,
      failCount: 0,
      lastTestedAt: null,
      expiresAt: null,
      active: true,
    },
  ],
};

// Captured immediately after module load. The listeners are registered once, as a
// side effect of importing service-worker.ts, so this must run before any per-test
// jest.clearAllMocks() would wipe that call record.
const registeredOnCommitted = addListenerMocks.onCommitted.mock.calls[0]?.[0];
const registeredOnHistoryStateUpdated =
  addListenerMocks.onHistoryStateUpdated.mock.calls[0]?.[0];
const registeredOnBeforeNavigate =
  addListenerMocks.onBeforeNavigate.mock.calls[0]?.[0];
const registeredOnActivated =
  addListenerMocks.tabsOnActivated.mock.calls[0]?.[0];
const registeredOnMessage = addListenerMocks.onMessage.mock.calls[0]?.[0] as (
  message: unknown,
  sender: chrome.runtime.MessageSender,
  sendResponse: (response: unknown) => void,
) => boolean;

// Lets fire-and-forget listener work (landing checks, deferred popups) settle.
async function flush(): Promise<void> {
  for (let i = 0; i < 20; i++) await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
}

function sendMessage(
  message: unknown,
  sender: chrome.runtime.MessageSender = {},
): Promise<unknown> {
  return new Promise((resolve) => {
    registeredOnMessage(message, sender, resolve);
  });
}

it("does not let a content script activate reviewer access", async () => {
  jest.mocked(activateReviewer).mockClear();
  const response = await sendMessage({type:"ACTIVATE_REVIEWER",code:"REV-test"}, {
    id: "test-extension", tab: {id: 900} as chrome.tabs.Tab, url: "https://shop.example.com/checkout",
  });
  expect(response).toEqual({error:"Open Saverlly to enter your access code."});
  expect(activateReviewer).not.toHaveBeenCalled();
});

it("accepts activation messages only from the popup and returns useful failures", async () => {
  jest.mocked(activateReviewer).mockRejectedValueOnce(new Error("This code has expired"));
  expect(await sendMessage({type:"ACTIVATE_REVIEWER",code:"REV-test"}, {
    id:"test-extension",url:"chrome-extension://test-extension/popup/popup.html",
  })).toEqual({error:"This code has expired"});
});

describe("store setup messages", () => {
  const optionsPage = {
    id: "test-extension",
    url: "chrome-extension://test-extension/options/options.html",
  };
  const setupRecord = {
    token: "secret-token",
    apiBaseUrl: "https://api.saverlly.test",
    sessionId: "s1",
    expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
    merchant: { id: "m1", name: "Shop", domain: "shop.test" },
  };
  const { token: _token, apiBaseUrl: _apiBaseUrl, ...publicStatus } = setupRecord;
  beforeEach(() => {
    jest.mocked(redeemStoreSetupCode).mockReset();
    jest.mocked(getStoreSetup).mockReset().mockResolvedValue(setupRecord);
    jest.mocked(fetchStoreSetupSession).mockReset();
    jest.mocked(endStoreSetup).mockReset().mockResolvedValue(undefined);
  });

  it("refuses every setup message from a content script on a store page", async () => {
    const contentScript = {
      id: "test-extension",
      tab: { id: 900 } as chrome.tabs.Tab,
      url: "https://shop.test/checkout",
    };
    for (const message of [
      { type: "STORE_SETUP_REDEEM", code: "SET-7K4Q-92MD" },
      { type: "STORE_SETUP_STATUS" },
      { type: "STORE_SETUP_END" },
    ])
      expect(await sendMessage(message, contentScript)).toEqual({
        error: "Store setup is only available from Saverlly's options page.",
      });
    expect(
      await sendMessage({ type: "STORE_SETUP_STATUS" }, { id: "another-extension", url: optionsPage.url }),
    ).toEqual({ error: "Store setup is only available from Saverlly's options page." });
    expect(redeemStoreSetupCode).not.toHaveBeenCalled();
    expect(endStoreSetup).not.toHaveBeenCalled();
  });

  it("redeems from the options page without ever handing the token to the page", async () => {
    jest.mocked(redeemStoreSetupCode).mockResolvedValueOnce(setupRecord);
    const response = await sendMessage({ type: "STORE_SETUP_REDEEM", code: "SET-7K4Q-92MD" }, optionsPage);
    expect(response).toEqual({ setup: publicStatus });
    expect(JSON.stringify(response)).not.toContain("secret-token");
  });

  it("turns network failures into a readable message and passes backend messages through", async () => {
    jest
      .mocked(redeemStoreSetupCode)
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockRejectedValueOnce(Object.assign(new Error("signal timed out"), { name: "TimeoutError" }))
      .mockRejectedValueOnce(new Error("This setup code is invalid or has expired"));
    const redeem = () => sendMessage({ type: "STORE_SETUP_REDEEM", code: "SET-7K4Q-92MD" }, optionsPage);
    const unreachable = { error: "Could not reach Saverlly. Check the connection and try again." };
    expect(await redeem()).toEqual(unreachable);
    expect(await redeem()).toEqual(unreachable);
    expect(await redeem()).toEqual({ error: "This setup code is invalid or has expired" });
  });

  it("answers the popup's status check locally, without a network call", async () => {
    const popup = { id: "test-extension", url: "chrome-extension://test-extension/popup/popup.html" };
    expect(await sendMessage({ type: "STORE_SETUP_STATUS" }, popup)).toEqual({ setup: publicStatus });
    expect(fetchStoreSetupSession).not.toHaveBeenCalled();
  });

  it("drops the session on verify only when the backend says it has ended", async () => {
    const verify = () => sendMessage({ type: "STORE_SETUP_STATUS", verify: true }, optionsPage);
    jest.mocked(fetchStoreSetupSession).mockRejectedValueOnce(new TypeError("Failed to fetch"));
    expect(await verify()).toEqual({ setup: publicStatus });
    jest.mocked(fetchStoreSetupSession).mockRejectedValueOnce(new StoreSetupEndedError());
    expect(await verify()).toEqual({ setup: null });
  });

  it("ends the session from the options page", async () => {
    expect(await sendMessage({ type: "STORE_SETUP_END" }, optionsPage)).toEqual({ ended: true });
    expect(endStoreSetup).toHaveBeenCalledTimes(1);
  });
});

describe("top-frame navigation handling", () => {
  beforeEach(() => {
    mockIsDormant.mockReset();
    mockGetCachedMerchant.mockReset();
    mockSetCachedMerchant.mockReset();
    mockFetchMerchantByDomain.mockReset();
    mockRunAttribution.mockReset();
    chromeMock.action.setBadgeText.mockClear();
    chromeMock.action.setBadgeBackgroundColor.mockClear();
    chromeMock.scripting.executeScript.mockClear();
  });

  it("registers a handler for both onCommitted and onHistoryStateUpdated", () => {
    expect(registeredOnCommitted).toBeDefined();
    expect(registeredOnHistoryStateUpdated).toBeDefined();
    expect(registeredOnCommitted).not.toBe(registeredOnHistoryStateUpdated);
  });

  it("injects the checkout-detector on a plain onCommitted document load too", async () => {
    mockIsDormant.mockResolvedValue(false);
    mockGetCachedMerchant.mockResolvedValue(null);
    mockSetCachedMerchant.mockResolvedValue(undefined);
    mockFetchMerchantByDomain.mockResolvedValue(merchant);
    mockRunAttribution.mockResolvedValue(null);

    await registeredOnCommitted({
      tabId: 7,
      frameId: 0,
      url: "https://shop.example.com/checkout",
    });

    expect(chromeMock.scripting.executeScript).toHaveBeenLastCalledWith(
      expect.objectContaining({
        target: { tabId: 7, allFrames: true },
        files: ["content-scripts/checkout-detector.js"],
      }),
    );
  });

  it("injects the checkout-detector on a cart-to-checkout History API route change with no document reload", async () => {
    mockIsDormant.mockResolvedValue(false);
    mockGetCachedMerchant.mockResolvedValue(null);
    mockSetCachedMerchant.mockResolvedValue(undefined);
    mockFetchMerchantByDomain.mockResolvedValue(merchant);
    mockRunAttribution.mockResolvedValue(null);

    await registeredOnHistoryStateUpdated({
      tabId: 7,
      frameId: 0,
      url: "https://shop.example.com/checkout",
    });

    expect(chromeMock.scripting.executeScript).toHaveBeenCalledTimes(2);
    expect(chromeMock.scripting.executeScript).toHaveBeenLastCalledWith(
      expect.objectContaining({
        target: { tabId: 7, allFrames: true },
        files: ["content-scripts/checkout-detector.js"],
      }),
    );
  });

  it("clears stale tab state and the badge immediately, even when the extension is dormant", async () => {
    mockIsDormant.mockResolvedValue(true);

    await registeredOnHistoryStateUpdated({
      tabId: 7,
      frameId: 0,
      url: "https://shop.example.com/checkout",
    });

    expect(chromeMock.action.setBadgeText).toHaveBeenCalledWith({
      tabId: 7,
      text: "",
    });
    expect(mockFetchMerchantByDomain).not.toHaveBeenCalled();
  });

  // Regression test for a real reload loop: some merchant sites rewrite their own URL via
  // history.replaceState shortly after load (a cosmetic "clean URL" step) that strips the
  // very affiliate query param runAttribution just appended. Before this guard, that site-
  // initiated rewrite fired onHistoryStateUpdated, which re-ran attribution, which redirected
  // again via chrome.tabs.update, reloading the page -- which then stripped the param again on
  // load, forever. Confirmed as the live symptom: the affiliate site keeps reloading, url-param
  // merchants only (cookie-only merchants have no redirect step to loop on).
  it("never attributes automatic navigation, including reloads and URL cleanup", async () => {
    mockIsDormant.mockResolvedValue(false);
    mockGetCachedMerchant.mockResolvedValue(null);
    mockSetCachedMerchant.mockResolvedValue(undefined);
    mockFetchMerchantByDomain.mockResolvedValue(merchant);
    mockRunAttribution.mockResolvedValue(
      "https://shop.example.com/checkout?aff=123",
    );

    await registeredOnCommitted({
      tabId: 7,
      frameId: 0,
      url: "https://shop.example.com/checkout",
    });
    expect(mockRunAttribution).not.toHaveBeenCalled();

    // The site's own script strips the param via history.replaceState -- same document,
    // no real navigation, but the URL looks unattributed again.
    await registeredOnHistoryStateUpdated({
      tabId: 7,
      frameId: 0,
      url: "https://shop.example.com/checkout",
    });
    expect(mockRunAttribution).not.toHaveBeenCalled();

    // A genuine fresh document load (e.g. the user reloads, or navigates away and back)
    // legitimately should attribute again.
    await registeredOnCommitted({
      tabId: 7,
      frameId: 0,
      url: "https://shop.example.com/checkout",
    });
    expect(mockRunAttribution).not.toHaveBeenCalled();
  });

  it("ignores sub-frame navigation events", async () => {
    await registeredOnHistoryStateUpdated({
      tabId: 7,
      frameId: 1,
      url: "https://ads.example.com/iframe",
    });

    expect(chromeMock.action.setBadgeText).not.toHaveBeenCalled();
    expect(mockIsDormant).not.toHaveBeenCalled();
  });
});

describe("CHECKOUT_CONFIRMED manual-trigger", () => {
  beforeEach(() => {
    mockRunAttribution.mockReset().mockResolvedValue(null);
    mockIsDormant.mockReset().mockResolvedValue(false);
    mockGetCachedMerchant.mockReset().mockResolvedValue(null);
    mockSetCachedMerchant.mockReset().mockResolvedValue(undefined);
    mockFetchMerchantByDomain.mockReset().mockResolvedValue(merchant);
    mockReportCouponTestEvent.mockReset().mockResolvedValue(undefined);
    chromeMock.tabs.get
      .mockReset()
      .mockResolvedValue({ url: "https://shop.example.com/checkout" });
    chromeMock.cookies.getAll.mockReset().mockResolvedValue([]);
    chromeMock.scripting.executeScript.mockClear();
    chromeMock.action.setBadgeText.mockClear();
    chromeMock.action.setBadgeBackgroundColor.mockClear();
    chromeMock.action.openPopup.mockClear();
    for (const key of Object.keys(sessionStore)) delete sessionStore[key];
  });

  it("shows the ready badge but does not apply coupons until APPLY_BEST_COUPON is sent, when no competing affiliate link is active", async () => {
    await sendMessage(
      { type: "CHECKOUT_CONFIRMED", merchantId: "m1", referrer: "" },
      { tab: { id: 7 } } as chrome.runtime.MessageSender,
    );

    expect(chromeMock.action.setBadgeText).toHaveBeenCalledWith({
      tabId: 7,
      text: "%",
    });
    expect(chromeMock.scripting.executeScript).not.toHaveBeenCalledWith(
      expect.objectContaining({ files: ["content-scripts/coupon-applier.js"] }),
    );
  });

  it("applies coupons once the popup sends APPLY_BEST_COUPON for the ready tab", async () => {
    chromeMock.tabs.query.mockResolvedValue([{ id: 7 }]);

    await sendMessage(
      { type: "CHECKOUT_CONFIRMED", merchantId: "m1", referrer: "" },
      { tab: { id: 7 } } as chrome.runtime.MessageSender,
    );
    await sendMessage({ type: "APPLY_BEST_COUPON" });

    expect(mockRunAttribution).toHaveBeenCalledWith(
      7,
      "https://shop.example.com/checkout",
      merchant,
      expect.any(Function),
    );

    expect(chromeMock.scripting.executeScript).toHaveBeenLastCalledWith(
      expect.objectContaining({
        target: { tabId: 7, frameIds: [0] },
        files: ["content-scripts/coupon-applier.js"],
      }),
    );
  });

  it("does not auto-apply and stays paused when a competing affiliate link is already active", async () => {
    chromeMock.cookies.getAll.mockResolvedValue([{ name: "irclickid" }]);

    await sendMessage(
      { type: "CHECKOUT_CONFIRMED", merchantId: "m1", referrer: "" },
      { tab: { id: 7 } } as chrome.runtime.MessageSender,
    );

    expect(chromeMock.action.setBadgeText).toHaveBeenCalledWith({
      tabId: 7,
      text: "!",
    });
    expect(chromeMock.scripting.executeScript).not.toHaveBeenCalledWith(
      expect.objectContaining({ files: ["content-scripts/coupon-applier.js"] }),
    );
    expect(mockReportCouponTestEvent).toHaveBeenCalledWith(
      expect.objectContaining({ result: "suppressed_stepdown" }),
    );
  });

  it("opens the popup over the checkout tab only while that tab is the one being viewed", async () => {
    chromeMock.tabs.get.mockResolvedValue({
      url: "https://shop.example.com/checkout",
      active: true,
      windowId: 3,
    });

    await sendMessage(
      { type: "CHECKOUT_CONFIRMED", merchantId: "m1", referrer: "" },
      { tab: { id: 7 } } as chrome.runtime.MessageSender,
    );

    expect(chromeMock.action.openPopup).toHaveBeenCalledWith({ windowId: 3 });
  });

  it("never opens the popup over another tab when a background checkout becomes ready, and opens it once the shopper switches to that tab", async () => {
    // A cart left open in a background tab while the shopper watches YouTube.
    chromeMock.tabs.get.mockResolvedValue({
      url: "https://shop.example.com/checkout",
      active: false,
      windowId: 3,
    });

    await sendMessage(
      { type: "CHECKOUT_CONFIRMED", merchantId: "m1", referrer: "" },
      { tab: { id: 8 } } as chrome.runtime.MessageSender,
    );
    expect(chromeMock.action.openPopup).not.toHaveBeenCalled();
    expect(chromeMock.action.setBadgeText).toHaveBeenCalledWith({
      tabId: 8,
      text: "%",
    });

    chromeMock.tabs.get.mockResolvedValue({
      url: "https://shop.example.com/checkout",
      active: true,
      windowId: 3,
    });
    registeredOnActivated({ tabId: 8, windowId: 3 });
    await flush();

    expect(chromeMock.action.openPopup).toHaveBeenCalledTimes(1);
    expect(chromeMock.action.openPopup).toHaveBeenCalledWith({ windowId: 3 });

    // Only once: revisiting the tab later does not keep reopening it.
    registeredOnActivated({ tabId: 8, windowId: 3 });
    await flush();
    expect(chromeMock.action.openPopup).toHaveBeenCalledTimes(1);
  });

  it("stands down at checkout when the visit began on an affiliate link several pages earlier", async () => {
    // Landing: shop.example.com/product?ranSiteID=... (Rakuten, mixed-case parameter).
    await registeredOnCommitted({
      tabId: 7,
      frameId: 0,
      url: "https://shop.example.com/product?ranSiteID=pub-123&ranMID=999",
      transitionQualifiers: [],
    });
    await flush();

    // Checkout: no parameters left in the URL, no referrer, no tracking cookie.
    await sendMessage(
      { type: "CHECKOUT_CONFIRMED", merchantId: "m1", referrer: "" },
      { tab: { id: 7 } } as chrome.runtime.MessageSender,
    );

    expect(chromeMock.action.setBadgeText).toHaveBeenCalledWith({
      tabId: 7,
      text: "!",
    });
    expect(chromeMock.action.openPopup).not.toHaveBeenCalled();
  });

  it("stands down when an affiliate network redirect hop delivered the shopper, even with a clean merchant URL", async () => {
    registeredOnBeforeNavigate({
      tabId: 9,
      frameId: 0,
      url: "https://click.linksynergy.com/deeplink?id=abc&mid=1",
    });
    await registeredOnCommitted({
      tabId: 9,
      frameId: 0,
      url: "https://shop.example.com/",
      transitionQualifiers: ["server_redirect"],
    });
    await flush();

    await sendMessage(
      { type: "CHECKOUT_CONFIRMED", merchantId: "m1", referrer: "" },
      { tab: { id: 9 } } as chrome.runtime.MessageSender,
    );

    expect(chromeMock.action.setBadgeText).toHaveBeenCalledWith({
      tabId: 9,
      text: "!",
    });
  });

  it("lets the shopper override a stand-down from the paused screen, and remembers it", async () => {
    await registeredOnCommitted({
      tabId: 7,
      frameId: 0,
      url: "https://shop.example.com/?irclickid=competitor",
      transitionQualifiers: [],
    });
    await flush();
    await sendMessage(
      { type: "CHECKOUT_CONFIRMED", merchantId: "m1", referrer: "" },
      { tab: { id: 7 } } as chrome.runtime.MessageSender,
    );
    chromeMock.tabs.query.mockResolvedValue([{ id: 7 }]);

    await sendMessage({ type: "APPLY_BEST_COUPON" });
    expect(mockRunAttribution).toHaveBeenCalled();

    // Same checkout reloaded: no longer paused.
    chromeMock.action.setBadgeText.mockClear();
    await registeredOnCommitted({
      tabId: 7,
      frameId: 0,
      url: "https://shop.example.com/checkout",
      transitionQualifiers: [],
    });
    await sendMessage(
      { type: "CHECKOUT_CONFIRMED", merchantId: "m1", referrer: "" },
      { tab: { id: 7 } } as chrome.runtime.MessageSender,
    );
    expect(chromeMock.action.setBadgeText).toHaveBeenLastCalledWith({
      tabId: 7,
      text: "%",
    });
  });

  it("does not treat Saverlly's own attribution parameter as a competing affiliate", async () => {
    mockFetchMerchantByDomain.mockResolvedValue({
      ...merchant,
      affiliateUrlParamKey: "clickid",
      affiliateUrlParamValue: "saverlly-1",
    });
    await registeredOnCommitted({
      tabId: 7,
      frameId: 0,
      url: "https://shop.example.com/checkout?clickid=saverlly-1",
      transitionQualifiers: [],
    });
    await flush();
    await sendMessage(
      { type: "CHECKOUT_CONFIRMED", merchantId: "m1", referrer: "" },
      { tab: { id: 7 } } as chrome.runtime.MessageSender,
    );

    expect(chromeMock.action.setBadgeText).toHaveBeenLastCalledWith({
      tabId: 7,
      text: "%",
    });
  });

  it("lets GET_TAB_STATE reflect the ready-but-not-yet-applied state, for a popup opened right after checkout is confirmed", async () => {
    chromeMock.tabs.query.mockResolvedValue([{ id: 7 }]);

    await sendMessage(
      { type: "CHECKOUT_CONFIRMED", merchantId: "m1", referrer: "" },
      { tab: { id: 7 } } as chrome.runtime.MessageSender,
    );

    const state = (await sendMessage({ type: "GET_TAB_STATE" })) as {
      suppressedStepdown: boolean;
      applyProgress: unknown;
      applyResult: unknown;
    } | null;

    expect(state).not.toBeNull();
    expect(state?.suppressedStepdown).toBe(false);
    expect(state?.applyProgress).toBeNull();
    expect(state?.applyResult).toBeNull();
  });
});

describe("GET_ACTIVE_PROMOTIONS", () => {
  const promo = {
    id: "p1",
    imageSmallUrl: "https://cdn.example.com/small.png",
    imageLargeUrl: "https://cdn.example.com/large.png",
    clickUrl: "https://example.com/offer",
  };

  beforeEach(() => {
    mockIsDormant.mockReset();
    mockFetchActivePromotions.mockReset();
  });

  it("returns the promotions the backend served", async () => {
    mockIsDormant.mockResolvedValue(false);
    mockFetchActivePromotions.mockResolvedValue([promo]);

    await expect(
      sendMessage({ type: "GET_ACTIVE_PROMOTIONS" }),
    ).resolves.toEqual([promo]);
  });

  it("returns nothing and never calls the API while dormant", async () => {
    mockIsDormant.mockResolvedValue(true);

    await expect(
      sendMessage({ type: "GET_ACTIVE_PROMOTIONS" }),
    ).resolves.toEqual([]);
    expect(mockFetchActivePromotions).not.toHaveBeenCalled();
  });

  it("degrades to no promotions when the lookup fails, rather than rejecting into the popup", async () => {
    mockIsDormant.mockResolvedValue(false);
    mockFetchActivePromotions.mockRejectedValue(new Error("network down"));

    await expect(
      sendMessage({ type: "GET_ACTIVE_PROMOTIONS" }),
    ).resolves.toEqual([]);
  });
});

describe("tab state survives an MV3 service-worker recycle", () => {
  // Regression coverage: tab state used to live only in an in-memory Map, wiped whenever
  // Chrome recycles the background service worker (idle teardown, sleep, etc). A popup
  // reopened after that saw GET_TAB_STATE return null and rendered "no offers here yet" --
  // even right after a real, successful apply. These use a tab id (99) untouched by any
  // other test in this file, so the in-memory cache genuinely has nothing for it and any
  // hit has to come from the chrome.storage.session fallback, not leftover Map state.
  beforeEach(() => {
    mockIsDormant.mockReset().mockResolvedValue(false);
    mockGetPersistedTabState.mockReset().mockResolvedValue(null);
    mockSetPersistedTabState.mockReset().mockResolvedValue(undefined);
    chromeMock.tabs.query.mockReset();
  });

  it("GET_TAB_STATE falls back to the persisted copy when the in-memory cache is empty", async () => {
    chromeMock.tabs.query.mockResolvedValue([{ id: 99 }]);
    const persisted: TabCheckoutState = {
      merchantId: "m1",
      merchantName: "Test Merchant",
      coupons: merchant.coupons,
      suppressedStepdown: false,
      applyProgress: null,
      applyResult: {
        type: "COUPON_APPLY_RESULT",
        merchantId: "m1",
        couponId: "c1",
        code: "SAVE10",
        result: "applied",
        isFinal: true,
      },
    };
    mockGetPersistedTabState.mockResolvedValue(persisted);

    const state = await sendMessage({ type: "GET_TAB_STATE" });

    expect(mockGetPersistedTabState).toHaveBeenCalledWith(99);
    expect(state).toEqual(persisted);
  });

  it("writes a final apply result through to chrome.storage.session, not just the in-memory cache", async () => {
    chromeMock.tabs.query.mockResolvedValue([{ id: 99 }]);
    chromeMock.tabs.get.mockResolvedValue({
      url: "https://shop.example.com/checkout",
    });
    mockGetCachedMerchant.mockResolvedValue(null);
    mockSetCachedMerchant.mockResolvedValue(undefined);
    mockFetchMerchantByDomain.mockResolvedValue(merchant);
    mockReportCouponTestEvent.mockResolvedValue(undefined);
    chromeMock.cookies.getAll.mockResolvedValue([]);

    await sendMessage(
      { type: "CHECKOUT_CONFIRMED", merchantId: "m1", referrer: "" },
      { tab: { id: 99 } } as chrome.runtime.MessageSender,
    );
    mockSetPersistedTabState.mockClear();

    await sendMessage(
      {
        type: "COUPON_APPLY_RESULT",
        merchantId: "m1",
        couponId: "c1",
        code: "SAVE10",
        result: "applied",
        isFinal: true,
      },
      { tab: { id: 99 } } as chrome.runtime.MessageSender,
    );

    expect(mockSetPersistedTabState).toHaveBeenCalledWith(
      99,
      expect.objectContaining({
        applyResult: expect.objectContaining({
          code: "SAVE10",
          result: "applied",
        }),
      }),
    );
  });
});

it("persists and relays a tab-scoped final result even when reporting fails", async () => {
  mockGetPersistedTabState.mockResolvedValue({
    merchantId: "m1",
    merchantName: "Store",
    coupons: merchant.coupons,
    suppressedStepdown: false,
    applyProgress: null,
    applyResult: null,
  });
  mockReportCouponTestEvent.mockRejectedValueOnce(
    new Error("reporting unavailable"),
  );
  const log = jest.spyOn(console, "error").mockImplementation(() => {});
  const result = {
    type: "COUPON_APPLY_RESULT",
    merchantId: "m1",
    couponId: "c1",
    code: "SAVE10",
    result: "applied",
    isFinal: true,
  };
  await sendMessage(result, {
    tab: { id: 811 },
  } as chrome.runtime.MessageSender);
  expect(mockSetPersistedTabState).toHaveBeenCalledWith(
    811,
    expect.objectContaining({ applyResult: result }),
  );
  expect(chromeMock.runtime.sendMessage).toHaveBeenCalledWith({
    type: "APPLY_DONE",
    tabId: 811,
    result,
  });
  log.mockRestore();
});

it("returns an explicit start failure when no active checkout exists", async () => {
  mockIsDormant.mockResolvedValue(false);
  chromeMock.tabs.query.mockResolvedValue([]);
  await expect(sendMessage({ type: "APPLY_BEST_COUPON" })).resolves.toEqual({
    started: false,
  });
});

it("reports temporary successful trials as valid without saved money", async () => {
  mockGetPersistedTabState.mockResolvedValue({
    merchantId: "m1",
    merchantName: "Store",
    coupons: merchant.coupons,
    suppressedStepdown: false,
    applyProgress: null,
    applyResult: null,
  });
  mockReportCouponTestEvent.mockClear();
  await sendMessage(
    {
      type: "COUPON_APPLY_RESULT",
      merchantId: "m1",
      couponId: "c1",
      code: "SAVE10",
      result: "applied",
      isFinal: false,
    },
    { tab: { id: 812 } } as chrome.runtime.MessageSender,
  );
  expect(mockReportCouponTestEvent).toHaveBeenCalledWith(
    expect.objectContaining({ result: "valid", isFinal: false }),
  );
});

it("preserves a running checkout through same-path URL cleanup and ignores a stale run result", async () => {
  const state: TabCheckoutState = {
    merchantId: "m1",
    merchantName: "Store",
    coupons: merchant.coupons,
    checkoutUrl: "https://shop.example.com/checkout",
    runId: "current",
    suppressedStepdown: false,
    applyProgress: {
      type: "COUPON_APPLY_PROGRESS",
      phase: "testing",
      code: "SAVE10",
      index: 1,
      total: 1,
      runId: "current",
    },
    applyResult: null,
  };
  mockIsDormant.mockResolvedValue(false);
  mockGetPersistedTabState.mockResolvedValue(state);
  chromeMock.tabs.query.mockResolvedValue([{ id: 901 }]);
  await registeredOnHistoryStateUpdated({
    tabId: 901,
    frameId: 0,
    url: "https://shop.example.com/checkout?clean=true",
  });
  expect(await sendMessage({ type: "GET_TAB_STATE" })).toEqual(state);
  await sendMessage(
    {
      type: "COUPON_APPLY_RESULT",
      merchantId: "m1",
      result: "failed",
      isFinal: true,
      runId: "old",
    },
    { tab: { id: 901 } } as chrome.runtime.MessageSender,
  );
  expect(await sendMessage({ type: "GET_TAB_STATE" })).toEqual(state);
});

it("reports only incremental savings while preserving the displayed full discount", async () => {
  mockGetPersistedTabState.mockResolvedValue({
    merchantId: "m1",
    merchantName: "Store",
    coupons: merchant.coupons,
    runId: "retry",
    suppressedStepdown: false,
    applyProgress: null,
    applyResult: null,
  });
  mockReportCouponTestEvent.mockResolvedValue(undefined);
  chromeMock.tabs.query.mockResolvedValue([{ id: 903 }]);
  await sendMessage(
    {
      type: "COUPON_APPLY_RESULT",
      merchantId: "m1",
      couponId: "c1",
      code: "SAVE10",
      result: "applied",
      isFinal: true,
      runId: "retry",
      discountAmount: 10,
      incrementalSavings: 0,
    },
    { tab: { id: 903 } } as chrome.runtime.MessageSender,
  );
  expect(mockReportCouponTestEvent).toHaveBeenCalledWith(
    expect.objectContaining({ result: "applied", discountAmount: 0 }),
  );
  expect(await sendMessage({ type: "GET_TAB_STATE" })).toEqual(
    expect.objectContaining({
      applyResult: expect.objectContaining({
        discountAmount: 10,
        incrementalSavings: 0,
      }),
    }),
  );
});

it("does not let late progress erase a final result from the same run", async () => {
  mockGetPersistedTabState.mockResolvedValue({
    merchantId: "m1",
    merchantName: "Store",
    coupons: merchant.coupons,
    runId: "r1",
    suppressedStepdown: false,
    applyProgress: null,
    applyResult: null,
  });
  mockReportCouponTestEvent.mockResolvedValue(undefined);
  chromeMock.tabs.query.mockResolvedValue([{ id: 902 }]);
  const sender = { tab: { id: 902 } } as chrome.runtime.MessageSender;
  await Promise.all([
    sendMessage(
      {
        type: "COUPON_APPLY_RESULT",
        merchantId: "m1",
        result: "applied",
        isFinal: true,
        runId: "r1",
        discountAmount: 10,
      },
      sender,
    ),
    sendMessage(
      {
        type: "COUPON_APPLY_PROGRESS",
        phase: "testing",
        code: "SAVE10",
        index: 1,
        total: 1,
        runId: "r1",
      },
      sender,
    ),
  ]);
  expect(await sendMessage({ type: "GET_TAB_STATE" })).toEqual(
    expect.objectContaining({
      applyResult: expect.objectContaining({ result: "applied" }),
      applyProgress: null,
    }),
  );
});

it("ends a running checkout with checkout_changed when the page reloads, so the popup cannot hang", async () => {
  mockIsDormant.mockReset().mockResolvedValue(false);
  jest.mocked(peekPendingApply).mockReset().mockResolvedValue(null);
  mockGetPersistedTabState.mockReset().mockResolvedValue({
    merchantId: "m1",
    merchantName: "Store",
    coupons: merchant.coupons,
    checkoutUrl: "https://shop.example.com/checkout",
    runId: "running",
    suppressedStepdown: false,
    applyProgress: null,
    applyResult: null,
  });
  mockGetCachedMerchant.mockResolvedValue({ merchant, fetchedAt: Date.now() });
  chromeMock.runtime.sendMessage.mockReset().mockResolvedValue(undefined);
  await registeredOnCommitted({
    tabId: 9031,
    frameId: 0,
    url: "https://shop.example.com/checkout",
    transitionType: "reload",
    transitionQualifiers: [],
  });
  await flush();
  expect(chromeMock.runtime.sendMessage).toHaveBeenCalledWith({
    type: "APPLY_DONE",
    tabId: 9031,
    result: expect.objectContaining({
      result: "failed",
      isFinal: true,
      failureReason: "checkout_changed",
    }),
  });
});
