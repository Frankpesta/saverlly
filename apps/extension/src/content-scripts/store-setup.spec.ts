/**
 * @jest-environment jsdom
 */
declare function require(id: string): unknown;

const sendMessage = jest.fn();
let onMessage: ((message: unknown) => void) | undefined;
const flush = async () => {
  for (let i = 0; i < 20; i++) await Promise.resolve();
};
const host = () => document.querySelector("saverlly-store-setup");

beforeEach(() => {
  jest.resetModules();
  document.querySelectorAll("saverlly-store-setup").forEach((n) => n.remove());
  window.__SAVERLLY_SETUP__ = false;
  onMessage = undefined;
  sendMessage.mockReset();
  (globalThis as unknown as { chrome: unknown }).chrome = {
    runtime: {
      sendMessage,
      onMessage: {
        addListener: (fn: typeof onMessage) => (onMessage = fn),
        removeListener: (fn: typeof onMessage) => {
          if (onMessage === fn) onMessage = undefined;
        },
      },
    },
  };
});

function respond(context: unknown) {
  sendMessage.mockImplementation(async (message: { type: string }) =>
    message.type === "STORE_SETUP_TAB_CONTEXT" ? context : { saved: true },
  );
}
const context = { sessionId: "s1", storeName: "Demo", domain: "demo.test" };

it("does nothing unless the service worker confirms this is the setup tab", async () => {
  respond(null);
  require("./store-setup");
  await flush();
  expect(host()).toBeNull();
  expect(window.__SAVERLLY_SETUP__).toBe(false);
});

it("draws the panel once, however often it is injected", async () => {
  respond(context);
  require("./store-setup");
  jest.resetModules();
  require("./store-setup");
  await flush();
  expect(document.querySelectorAll("saverlly-store-setup")).toHaveLength(1);
  expect(sendMessage.mock.calls.filter(([m]) => m.type === "STORE_SETUP_TAB_CONTEXT")).toHaveLength(1);
});

it("closes when the service worker says setup ended", async () => {
  respond(context);
  require("./store-setup");
  await flush();
  expect(host()).not.toBeNull();
  onMessage!({ type: "STORE_SETUP_OVERLAY_CLOSE" });
  expect(host()).toBeNull();
  expect(window.__SAVERLLY_SETUP__).toBe(false);
  expect(onMessage).toBeUndefined();
});

it("saves progress as the admin moves through the steps, and resumes from it", async () => {
  respond({ ...context, progress: { version: 2, step: 3, pattern: "/checkout", reveal: "visible", picks: {} } });
  require("./store-setup");
  await flush();
  // Resumed on the promo box step, not the intro.
  expect(sendMessage).not.toHaveBeenCalledWith(expect.objectContaining({ type: "STORE_SETUP_TAB_PROGRESS" }));
  document.body.innerHTML = `<input name="discount">`;
  Object.defineProperty(HTMLElement.prototype, "offsetParent", { configurable: true, get: () => document.body });
  document.querySelector("input")!.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, composed: true }));
  await flush();
  expect(sendMessage).toHaveBeenCalledWith({
    type: "STORE_SETUP_TAB_PROGRESS",
    progress: {
      version: 2,
      step: 3,
      pattern: "/checkout",
      reveal: "visible",
      picks: { promoField: { selector: 'input[name="discount"]', strategy: "attribute", exact: true } },
    },
  });
});
