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
  onDOMContentLoaded: jest.fn(),
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
    sendMessage: jest.fn().mockResolvedValue(undefined),
  },
  webNavigation: {
    onCommitted: { addListener: addListenerMocks.onCommitted },
    onHistoryStateUpdated: {
      addListener: addListenerMocks.onHistoryStateUpdated,
    },
    onBeforeNavigate: { addListener: addListenerMocks.onBeforeNavigate },
    onDOMContentLoaded: { addListener: addListenerMocks.onDOMContentLoaded },
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
  submitStoreSetupRecipe: jest.fn(),
}));
import {
  endStoreSetup,
  fetchStoreSetupSession,
  getStoreSetup,
  redeemStoreSetupCode,
  StoreSetupEndedError,
  submitStoreSetupRecipe,
} from "../lib/store-setup";

import {
  fetchActivePromotions,
  fetchMerchantByDomain,
  reportRecipeHealth,
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
const registeredOnDOMContentLoaded = addListenerMocks.onDOMContentLoaded.mock.calls[0]?.[0] as (
  details: { tabId: number; frameId: number; url: string },
) => void;
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

describe("store setup on a tab pauses shopper mode there", () => {
  const popup = { id: "test-extension", url: "chrome-extension://test-extension/popup/popup.html" };
  const checkoutUrl = "https://shop.example.com/checkout";
  const setup = {
    token: "secret-token",
    apiBaseUrl: "https://api.saverlly.test",
    sessionId: "s1",
    expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
    merchant: { id: "m1", name: "Test Merchant", domain: "shop.example.com" },
  };
  const detectorInjections = () =>
    chromeMock.scripting.executeScript.mock.calls.filter(([arg]) =>
      (arg as { files?: string[] }).files?.includes("content-scripts/checkout-detector.js"),
    );
  const start = (tabId = 7) => sendMessage({ type: "STORE_SETUP_START_TAB", tabId }, popup);
  const confirm = (tabId = 7) =>
    sendMessage(
      { type: "CHECKOUT_CONFIRMED", merchantId: "m1", referrer: "" },
      { tab: { id: tabId } } as chrome.runtime.MessageSender,
    );

  beforeEach(() => {
    mockRunAttribution.mockReset().mockResolvedValue(null);
    mockIsDormant.mockReset().mockResolvedValue(false);
    mockGetCachedMerchant.mockReset().mockResolvedValue(null);
    mockSetCachedMerchant.mockReset().mockResolvedValue(undefined);
    // Only the store is a merchant, so other sites never get a detector of their own.
    mockFetchMerchantByDomain
      .mockReset()
      .mockImplementation(async (domain) => (domain === "shop.example.com" ? merchant : null));
    mockReportCouponTestEvent.mockReset().mockResolvedValue(undefined);
    mockGetPersistedTabState.mockReset().mockResolvedValue(null);
    jest.mocked(getStoreSetup).mockReset().mockResolvedValue(setup);
    chromeMock.tabs.get.mockReset().mockResolvedValue({ id: 7, url: checkoutUrl, active: true });
    chromeMock.tabs.query.mockReset().mockResolvedValue([{ id: 7 }]);
    chromeMock.cookies.getAll.mockReset().mockResolvedValue([]);
    chromeMock.scripting.executeScript.mockClear();
    chromeMock.action.setBadgeText.mockClear();
    chromeMock.action.openPopup.mockClear();
    for (const key of Object.keys(sessionStore)) delete sessionStore[key];
  });

  it("starts only on the store's own site, during a live session", async () => {
    chromeMock.tabs.get.mockResolvedValue({ id: 7, url: "https://evil-shop.example.com.attacker.test/checkout" });
    expect(await start()).toEqual({ error: "Open shop.example.com in this tab first.", reason: "wrong-site" });
    jest.mocked(getStoreSetup).mockResolvedValue(null);
    expect(await start()).toEqual({
      error: "Store setup has ended. Start a new one from the dashboard.",
      reason: "no-session",
    });
    expect(sessionStore.storeSetupTabs).toBeUndefined();
  });

  it("refuses to start in the middle of a coupon run on that tab", async () => {
    mockGetPersistedTabState.mockResolvedValue({
      merchantId: "m1",
      merchantName: "Test Merchant",
      coupons: [],
      suppressedStepdown: false,
      applyProgress: { type: "COUPON_APPLY_PROGRESS", phase: "testing", code: "SAVE10", index: 1, total: 1 },
      applyResult: null,
    });
    expect(await start(31)).toMatchObject({ reason: "busy" });
  });

  it("clears the tab's shopper state and pauses detection, popups, coupons and attribution", async () => {
    await confirm();
    expect(chromeMock.action.setBadgeText).toHaveBeenLastCalledWith({ tabId: 7, text: "%" });

    expect(await start()).toEqual({ started: true });
    expect(chromeMock.action.setBadgeText).toHaveBeenLastCalledWith({ tabId: 7, text: "" });
    expect(await sendMessage({ type: "GET_TAB_STATE" })).toBeNull();

    chromeMock.scripting.executeScript.mockClear();
    chromeMock.action.setBadgeText.mockClear();
    chromeMock.action.openPopup.mockClear();
    await registeredOnCommitted({ tabId: 7, frameId: 0, url: checkoutUrl, transitionQualifiers: [] });
    await confirm();
    expect(detectorInjections()).toHaveLength(0);
    expect(chromeMock.action.setBadgeText).not.toHaveBeenCalledWith({ tabId: 7, text: "%" });
    expect(chromeMock.action.openPopup).not.toHaveBeenCalled();
    expect(await sendMessage({ type: "APPLY_BEST_COUPON" })).toEqual({ started: false });
    expect(mockRunAttribution).not.toHaveBeenCalled();
  });

  it("leaves every other tab working normally", async () => {
    await start(7);
    chromeMock.tabs.get.mockResolvedValue({ id: 8, url: checkoutUrl, active: true });
    await registeredOnCommitted({ tabId: 8, frameId: 0, url: checkoutUrl, transitionQualifiers: [] });
    expect(detectorInjections()).toHaveLength(1);
    await confirm(8);
    expect(chromeMock.action.setBadgeText).toHaveBeenCalledWith({ tabId: 8, text: "%" });
  });

  it("records no affiliate stand-down from the admin's visit", async () => {
    await start();
    await registeredOnCommitted({
      tabId: 7,
      frameId: 0,
      url: "https://shop.example.com/product?ranSiteID=pub-123&ranMID=999",
      transitionQualifiers: [],
    });
    await flush();
    expect(await sendMessage({ type: "STORE_SETUP_STOP_TAB", tabId: 7 }, popup)).toEqual({ stopped: true });
    await confirm();
    expect(chromeMock.action.setBadgeText).toHaveBeenCalledWith({ tabId: 7, text: "%" });
    expect(chromeMock.action.setBadgeText).not.toHaveBeenCalledWith({ tabId: 7, text: "!" });
  });

  it("resumes shopper mode when stopped, when the tab leaves the store, and when the session ends", async () => {
    await start();
    chromeMock.scripting.executeScript.mockClear();
    await sendMessage({ type: "STORE_SETUP_STOP_TAB", tabId: 7 }, popup);
    expect(detectorInjections()).toHaveLength(1);

    await start();
    chromeMock.scripting.executeScript.mockClear();
    await registeredOnCommitted({ tabId: 7, frameId: 0, url: "https://news.example/", transitionQualifiers: [] });
    await registeredOnCommitted({ tabId: 7, frameId: 0, url: checkoutUrl, transitionQualifiers: [] });
    expect(detectorInjections()).toHaveLength(1);

    await start();
    jest.mocked(getStoreSetup).mockResolvedValue(null);
    chromeMock.scripting.executeScript.mockClear();
    await registeredOnCommitted({ tabId: 7, frameId: 0, url: checkoutUrl, transitionQualifiers: [] });
    expect(detectorInjections()).toHaveLength(1);
  });

  it("reports the tab's part in setup to the popup", async () => {
    const status = () => sendMessage({ type: "STORE_SETUP_STATUS", tabId: 7 }, popup);
    expect(await status()).toMatchObject({ tab: { onStore: true, running: false } });
    await start();
    expect(await status()).toMatchObject({ tab: { onStore: true, running: true } });
    chromeMock.tabs.get.mockResolvedValue({ id: 7, url: "https://news.example/" });
    expect(await status()).toMatchObject({ tab: { onStore: false, running: false } });
  });

  describe("the setup panel", () => {
    const panelInjections = () =>
      chromeMock.scripting.executeScript.mock.calls.filter(([arg]) =>
        (arg as { files?: string[] }).files?.includes("content-scripts/store-setup.js"),
      );
    const fromTab = (overrides: Partial<chrome.runtime.MessageSender> = {}) =>
      ({ id: "test-extension", tab: { id: 7 }, frameId: 0, url: checkoutUrl, ...overrides }) as chrome.runtime.MessageSender;

    it("is drawn on the tab's top frame when setup starts, and on every new store page", async () => {
      await start();
      expect(panelInjections()).toEqual([
        [{ target: { tabId: 7, frameIds: [0] }, files: ["content-scripts/store-setup.js"] }],
      ]);
      registeredOnDOMContentLoaded({ tabId: 7, frameId: 0, url: "https://shop.example.com/cart" });
      registeredOnDOMContentLoaded({ tabId: 7, frameId: 3, url: "https://shop.example.com/frame" });
      registeredOnDOMContentLoaded({ tabId: 8, frameId: 0, url: checkoutUrl });
      await flush();
      expect(panelInjections()).toHaveLength(2);
    });

    it("gives its context only to the setup tab's top frame on the store's site", async () => {
      await start();
      const context = () => sendMessage({ type: "STORE_SETUP_TAB_CONTEXT" }, fromTab());
      expect(await context()).toEqual({ sessionId: "s1", storeName: "Test Merchant", domain: "shop.example.com" });
      expect(await sendMessage({ type: "STORE_SETUP_TAB_CONTEXT" }, fromTab({ frameId: 2 }))).toBeNull();
      expect(await sendMessage({ type: "STORE_SETUP_TAB_CONTEXT" }, fromTab({ tab: { id: 8 } as chrome.tabs.Tab }))).toBeNull();
      expect(await sendMessage({ type: "STORE_SETUP_TAB_CONTEXT" }, fromTab({ id: "another-extension" }))).toBeNull();
      // A frame that has left the store ends setup on the tab.
      expect(await sendMessage({ type: "STORE_SETUP_TAB_CONTEXT" }, fromTab({ url: "https://news.example/" }))).toBeNull();
      expect(await context()).toBeNull();
    });

    it("keeps progress for the next page, within a size limit", async () => {
      await start();
      const progress = { version: 1, step: 1, picks: { promoField: { selector: "#code", strategy: "id", exact: true } } };
      expect(await sendMessage({ type: "STORE_SETUP_TAB_PROGRESS", progress }, fromTab())).toEqual({ saved: true });
      expect(await sendMessage({ type: "STORE_SETUP_TAB_CONTEXT" }, fromTab())).toMatchObject({ progress });
      expect(
        await sendMessage({ type: "STORE_SETUP_TAB_PROGRESS", progress: { junk: "x".repeat(40_000) } }, fromTab()),
      ).toEqual({ saved: false });
      expect(await sendMessage({ type: "STORE_SETUP_TAB_CONTEXT" }, fromTab())).toMatchObject({ progress });
    });

    it("stops from the panel and hands the tab back to shopper mode", async () => {
      await start();
      chromeMock.scripting.executeScript.mockClear();
      expect(await sendMessage({ type: "STORE_SETUP_TAB_STOP" }, fromTab())).toEqual({ stopped: true });
      expect(detectorInjections()).toHaveLength(1);
      expect(await sendMessage({ type: "STORE_SETUP_TAB_CONTEXT" }, fromTab())).toBeNull();
    });

    it("sends the draft from the setup tab only, and says when the session has ended", async () => {
      await start();
      const payload = {
        recipe: { couponFieldSelector: "#c", applyButtonSelector: "#a", cartTotalSelector: "#t", checkoutUrlPatterns: ["/checkout"] },
        testResult: { passed: true, checks: [{ key: "promoField", outcome: "pass" }], testedAt: new Date().toISOString() },
      };
      const submitMessage = { type: "STORE_SETUP_TAB_SUBMIT", payload };
      jest
        .mocked(submitStoreSetupRecipe)
        .mockReset()
        .mockResolvedValueOnce({} as never)
        .mockRejectedValueOnce(new StoreSetupEndedError())
        .mockRejectedValueOnce(new TypeError("Failed to fetch"));
      expect(await sendMessage(submitMessage, fromTab())).toEqual({ ok: true });
      expect(submitStoreSetupRecipe).toHaveBeenCalledWith(payload);
      expect(await sendMessage(submitMessage, fromTab())).toEqual({
        ok: false,
        ended: true,
        error: "This store setup session has ended. Start a new one from the dashboard.",
      });
      expect(await sendMessage(submitMessage, fromTab())).toEqual({
        ok: false,
        ended: false,
        error: "Could not reach Saverlly. Check the connection and try again.",
      });
      expect(await sendMessage(submitMessage, fromTab({ tab: { id: 8 } as chrome.tabs.Tab }))).toBeNull();
      expect(await sendMessage(submitMessage, fromTab({ frameId: 1 }))).toBeNull();
      expect(submitStoreSetupRecipe).toHaveBeenCalledTimes(3);
    });

    it("is told to close when setup is stopped from the popup", async () => {
      await start();
      chromeMock.tabs.sendMessage.mockClear();
      await sendMessage({ type: "STORE_SETUP_STOP_TAB", tabId: 7 }, popup);
      expect(chromeMock.tabs.sendMessage).toHaveBeenCalledWith(7, { type: "STORE_SETUP_OVERLAY_CLOSE" }, { frameId: 0 });
    });
  });

  it("only takes start and stop from Saverlly's own pages", async () => {
    const page = { id: "test-extension", tab: { id: 7 } as chrome.tabs.Tab, url: checkoutUrl };
    expect(await sendMessage({ type: "STORE_SETUP_START_TAB", tabId: 7 }, page)).toMatchObject({ error: expect.any(String) });
    expect(sessionStore.storeSetupTabs).toBeUndefined();
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

  it("re-checks within a minute a cached store that has coupons but no checkout recipe yet", async () => {
    mockIsDormant.mockResolvedValue(false);
    mockSetCachedMerchant.mockResolvedValue(undefined);
    mockRunAttribution.mockResolvedValue(null);
    const twoMinutesAgo = Date.now() - 2 * 60_000;
    mockGetCachedMerchant.mockResolvedValue({ merchant: { ...merchant, checkoutRecipe: null }, fetchedAt: twoMinutesAgo });
    mockFetchMerchantByDomain.mockResolvedValue(merchant);

    await registeredOnCommitted({ tabId: 7, frameId: 0, url: "https://shop.example.com/checkout" });

    expect(mockFetchMerchantByDomain).toHaveBeenCalledWith("shop.example.com");
    expect(chromeMock.scripting.executeScript).toHaveBeenLastCalledWith(
      expect.objectContaining({ files: ["content-scripts/checkout-detector.js"] }),
    );
  });

  it("keeps a usable cached store for the full cache time", async () => {
    mockIsDormant.mockResolvedValue(false);
    mockRunAttribution.mockResolvedValue(null);
    mockGetCachedMerchant.mockResolvedValue({ merchant, fetchedAt: Date.now() - 2 * 60_000 });

    await registeredOnCommitted({ tabId: 7, frameId: 0, url: "https://shop.example.com/checkout" });

    expect(mockFetchMerchantByDomain).not.toHaveBeenCalled();
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

  it("keeps the popup waiting when Chrome refuses it and the shopper switches tabs before the retry", async () => {
    chromeMock.tabs.get.mockResolvedValue({ url: "https://shop.example.com/checkout", active: true, windowId: 3 });
    // Chrome refuses, and the shopper moves to another tab before the first retry.
    chromeMock.action.openPopup.mockImplementationOnce(async () => {
      chromeMock.tabs.get.mockResolvedValue({ url: "https://shop.example.com/checkout", active: false, windowId: 3 });
      throw new Error("Could not open popup");
    });

    await sendMessage(
      { type: "CHECKOUT_CONFIRMED", merchantId: "m1", referrer: "" },
      { tab: { id: 8 } } as chrome.runtime.MessageSender,
    );
    expect(chromeMock.action.openPopup).toHaveBeenCalledTimes(1);

    chromeMock.tabs.get.mockResolvedValue({ url: "https://shop.example.com/checkout", active: true, windowId: 3 });
    registeredOnActivated({ tabId: 8, windowId: 3 });
    await flush();
    expect(chromeMock.action.openPopup).toHaveBeenCalledTimes(2);
  });

  it("runs coupons through the obvious promo box found when the store's saved one is gone", async () => {
    chromeMock.tabs.query.mockResolvedValue([{ id: 7 }]);
    const backup = { couponFieldSelector: "#discount-code", applyButtonSelector: "form > button" };
    await sendMessage(
      { type: "CHECKOUT_CONFIRMED", merchantId: "m1", referrer: "", backup },
      { tab: { id: 7 } } as chrome.runtime.MessageSender,
    );
    await sendMessage({ type: "APPLY_BEST_COUPON" });
    expect(chromeMock.scripting.executeScript).toHaveBeenCalledWith(
      expect.objectContaining({
        args: [
          expect.objectContaining({
            recipe: {
              couponFieldSelector: "#discount-code",
              applyButtonSelector: "form > button",
              cartTotalSelector: ".total",
              checkoutUrlPatterns: ["/checkout"],
            },
          }),
        ],
      }),
    );
  });

  describe("recipe health reports", () => {
    let local: Record<string, unknown>;
    const report = (message: object, sender: Partial<chrome.runtime.MessageSender> = {}) =>
      sendMessage(
        { type: "RECIPE_HEALTH", merchantId: "m1", ...message },
        { tab: { id: 7, url: "https://shop.example.com/checkout" } as chrome.tabs.Tab, frameId: 0, ...sender },
      );
    const mockReport = jest.mocked(reportRecipeHealth);
    beforeEach(() => {
      local = {};
      chromeMock.storage.local.get.mockImplementation(async (key: string) => (key in local ? { [key]: local[key] } : {}));
      (chromeMock.storage.local as unknown as { set: jest.Mock }).set = jest.fn(async (items: object) => Object.assign(local, items));
      mockReport.mockReset().mockResolvedValue(undefined);
    });
    afterEach(() => chromeMock.storage.local.get.mockReset().mockResolvedValue({}));

    it("passes a checkout's verdict on, once a day per store and outcome", async () => {
      await report({ ok: false, problem: "PROMO_BOX_CHANGED" });
      await report({ ok: false, problem: "PROMO_BOX_CHANGED" });
      await report({ ok: true });
      expect(mockReport.mock.calls).toEqual([
        [{ merchantId: "m1", ok: false, problem: "PROMO_BOX_CHANGED" }],
        [{ merchantId: "m1", ok: true }],
      ]);
    });

    it("tries again on a later visit when sending fails", async () => {
      mockReport.mockRejectedValueOnce(new TypeError("offline"));
      await report({ ok: true });
      await report({ ok: true });
      expect(mockReport).toHaveBeenCalledTimes(2);
    });

    it("ignores frames, other stores, and a dormant extension", async () => {
      await report({ ok: true }, { frameId: 3 });
      await report({ ok: true, merchantId: "someone-else" });
      mockIsDormant.mockResolvedValue(true);
      await report({ ok: true });
      expect(mockReport).not.toHaveBeenCalled();
    });
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
