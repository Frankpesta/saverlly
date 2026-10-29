import type { StoreSetupRecord } from "./store-setup";
import { getStoreSetup } from "./store-setup";
import {
  activeStoreSetupTab,
  clearStoreSetupTabs,
  isOnStoreDomain,
  startStoreSetupOnTab,
  stopStoreSetupOnTab,
} from "./store-setup-tabs";

jest.mock("./store-setup", () => ({ getStoreSetup: jest.fn() }));

let session: Record<string, unknown>;
const record = (sessionId = "s1", domain = "shop.test"): StoreSetupRecord => ({
  token: "t",
  apiBaseUrl: "https://api.saverlly.test",
  sessionId,
  expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
  merchant: { id: "m1", name: "Shop", domain },
});

beforeEach(() => {
  session = {};
  jest.mocked(getStoreSetup).mockReset().mockResolvedValue(record());
  (globalThis as unknown as { chrome: unknown }).chrome = {
    storage: {
      session: {
        // Copies, like real storage: nothing shares an object with the caller.
        get: jest.fn(async (key: string) =>
          key in session ? { [key]: JSON.parse(JSON.stringify(session[key])) } : {},
        ),
        set: jest.fn(async (items: Record<string, unknown>) => {
          Object.assign(session, JSON.parse(JSON.stringify(items)));
        }),
      },
    },
  };
});

describe("the store's own site", () => {
  it.each([
    "https://shop.test/checkout",
    "https://www.shop.test/cart",
    "https://checkout.shop.test/c/1",
    "http://SHOP.test./checkout",
  ])("includes %s", (url) => expect(isOnStoreDomain(url, "shop.test")).toBe(true));

  it.each([
    "https://evilshop.test/checkout",
    "https://shop.test.evil.example/checkout",
    "https://example.com/?next=shop.test",
    "chrome://extensions",
    "not a url",
    undefined,
  ])("excludes %s", (url) => expect(isOnStoreDomain(url, "shop.test")).toBe(false));

  it("treats a www-prefixed store domain the same way", () => {
    expect(isOnStoreDomain("https://shop.test/checkout", "www.shop.test")).toBe(true);
  });
});

describe("setup tabs", () => {
  it("starts, reports and stops setup on one tab only", async () => {
    await startStoreSetupOnTab(7, record());
    expect(await activeStoreSetupTab(7, "https://shop.test/checkout")).toMatchObject({
      sessionId: "s1",
      domain: "shop.test",
    });
    expect(await activeStoreSetupTab(8, "https://shop.test/checkout")).toBeNull();
    expect(await stopStoreSetupOnTab(7)).toBe(true);
    expect(await stopStoreSetupOnTab(7)).toBe(false);
    expect(await activeStoreSetupTab(7)).toBeNull();
  });

  it("ends setup on a tab that leaves the store's site, and keeps it across store pages", async () => {
    await startStoreSetupOnTab(7, record());
    expect(await activeStoreSetupTab(7, "https://shop.test/cart")).not.toBeNull();
    expect(await activeStoreSetupTab(7, "https://checkout.shop.test/x")).not.toBeNull();
    expect(await activeStoreSetupTab(7, "https://news.example/")).toBeNull();
    expect(await activeStoreSetupTab(7, "https://shop.test/cart")).toBeNull();
  });

  it("drops a tab whose session ended or was replaced", async () => {
    await startStoreSetupOnTab(7, record());
    jest.mocked(getStoreSetup).mockResolvedValue(record("s2"));
    expect(await activeStoreSetupTab(7)).toBeNull();

    await startStoreSetupOnTab(7, record("s2"));
    jest.mocked(getStoreSetup).mockResolvedValue(null);
    expect(await activeStoreSetupTab(7)).toBeNull();
    expect(session.storeSetupTabs).toEqual({});
  });

  it("clears every tab outside the session being kept", async () => {
    await startStoreSetupOnTab(1, record("old"));
    await startStoreSetupOnTab(2, record("new"));
    await startStoreSetupOnTab(3, record("old"));
    expect((await clearStoreSetupTabs("new")).sort()).toEqual([1, 3]);
    expect(Object.keys(session.storeSetupTabs as object)).toEqual(["2"]);
    expect(await clearStoreSetupTabs()).toEqual([2]);
  });

  it("does not lose a change when several land at once", async () => {
    await Promise.all([1, 2, 3, 4, 5].map((tabId) => startStoreSetupOnTab(tabId, record())));
    await Promise.all([stopStoreSetupOnTab(2), startStoreSetupOnTab(6, record())]);
    expect(Object.keys(session.storeSetupTabs as object).sort()).toEqual(["1", "3", "4", "5", "6"]);
  });
});
