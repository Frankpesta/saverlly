/** @jest-environment jsdom */
import type { TabCheckoutState } from "../lib/messages";
jest.mock("../lib/config", () => ({ getReviewerApiBaseUrl: () => "https://api.example.test" }));
declare function require(id: string): unknown;
let listener: (message: unknown, sender: unknown) => void;
let state: TabCheckoutState | null;
const sendMessage = jest.fn();
const flush = async () => {
  for (let i = 0; i < 12; i++) await Promise.resolve();
};
const success = {
  type: "COUPON_APPLY_RESULT",
  merchantId: "m1",
  couponId: "c1",
  code: "SAVE",
  result: "applied",
  isFinal: true,
  discountAmount: 10,
  originalTotal: 100,
  newTotal: 90,
} as const;

beforeEach(() => {
  jest.resetModules();
  document.body.innerHTML =
    '<main id="content"></main><span id="lifetime-value"></span><aside id="promo"></aside>';
  state = {
    merchantId: "m1",
    merchantName: "Store",
    coupons: [
      {
        id: "c1",
        code: "SAVE",
        discountType: null,
        discountValue: null,
        description: null,
        successCount: 1,
        failCount: 0,
      },
    ] as TabCheckoutState["coupons"],
    suppressedStepdown: false,
    applyProgress: null,
    applyResult: null,
  };
  sendMessage.mockReset().mockImplementation(async ({ type }) => {
    if (type === "GET_TAB_STATE") return state;
    if (type === "GET_LIFETIME_SAVED") return 0;
    if (type === "GET_ACTIVE_PROMOTIONS") return [];
    if (type === "APPLY_BEST_COUPON") return { started: false };
  });
  (globalThis as unknown as { chrome: unknown }).chrome = {
    runtime: {
      sendMessage,
      onMessage: { addListener: (fn: typeof listener) => (listener = fn) },
    },
    tabs: { query: async () => [{ id: 7 }] },
  };
});

it("activates a reviewer from the disconnected screen without an agent", async () => {
  let connected = false;
  sendMessage.mockImplementation(async ({type}) => {
    if (type === "GET_EXTENSION_STATUS") return {dormant: !connected};
    if (type === "ACTIVATE_REVIEWER") { connected = true; return {activated:true}; }
    if (type === "GET_ACTIVE_PROMOTIONS") return [];
    if (type === "GET_LIFETIME_SAVED") return 0;
    if (type === "GET_TAB_STATE") return state;
  });
  require("./popup");
  await flush();
  document.getElementById("reviewer-code-link")!.click();
  (document.getElementById("reviewer-code") as HTMLInputElement).value = "REV-TEST";
  document.getElementById("reviewer-form")!.dispatchEvent(new Event("submit", {bubbles:true,cancelable:true}));
  await flush();
  expect(sendMessage).toHaveBeenCalledWith({type:"ACTIVATE_REVIEWER",code:"REV-TEST"});
  expect(document.getElementById("content")!.dataset.view).toBe("idle");
});

it("restores success before the paused state and exposes the coupon list", async () => {
  state!.suppressedStepdown = true;
  state!.applyResult = success;
  require("./popup");
  await flush();
  expect(document.getElementById("content")!.dataset.view).toBe("success");
  document.getElementById("view-coupons-btn")!.click();
  expect(document.body.textContent).not.toContain("code off");
  expect(document.body.textContent).not.toContain("up to 1 code");
  document.getElementById("back-btn")!.click();
  expect(document.getElementById("content")!.dataset.view).toBe("success");
});

it("ignores another tab’s progress and completion", async () => {
  require("./popup");
  await flush();
  listener(
    {
      type: "COUPON_APPLY_PROGRESS",
      tabId: 8,
      index: 1,
      total: 1,
      code: "SAVE",
      phase: "testing",
    },
    {},
  );
  listener({ type: "APPLY_DONE", tabId: 8, result: success }, {});
  expect(document.getElementById("content")!.dataset.view).toBe("idle");
  listener({ type: "APPLY_DONE", tabId: 7, result: success }, {});
  expect(document.getElementById("content")!.dataset.view).toBe("success");
});

it("recovers when the worker cannot start an apply run", async () => {
  require("./popup");
  await flush();
  document.getElementById("apply-btn")!.click();
  await flush();
  expect(document.body.textContent).toContain("Unable to compare coupons");
  expect(document.getElementById("retry-btn")).not.toBeNull();
});

it("handles missing lifetime savings without formatting undefined as currency", async () => {
  sendMessage.mockImplementation(async ({ type }) =>
    type === "GET_TAB_STATE" ? state : undefined,
  );
  require("./popup");
  await flush();
  expect(document.getElementById("lifetime-value")!.textContent).toBe("—");
});

it("escapes quotes in sponsored URL attributes", async () => {
  sendMessage.mockImplementation(async ({ type }) =>
    type === "GET_ACTIVE_PROMOTIONS"
      ? [
          {
            clickUrl: 'https://example.com/" onclick="alert(1)',
            imageSmallUrl: 'https://example.com/" onerror="alert(1)',
          },
        ]
      : type === "GET_TAB_STATE"
        ? state
        : 0,
  );
  require("./popup");
  await flush();
  expect(document.querySelector("[onclick], [onerror]")).toBeNull();
});
