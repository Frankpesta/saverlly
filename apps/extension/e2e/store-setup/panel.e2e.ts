// The setup panel itself: starting from the popup, staying out of the store's way (closed shadow
// root, store CSS kept out, the store sees none of a pick), resuming after a reload, a click into
// a cross-origin payment frame, moving the panel, and stopping.
import { expect, test, waitFor } from "./fixtures";
import { hostileStore, paymentFrame } from "./stores";

test("the panel stays out of the store's way and survives a reload", async ({ context, page, extensionId, signIn, startSetup, serveStore, shot }) => {
  const frame = await serveStore(paymentFrame, "127.0.0.1");
  const store = await serveStore(hostileStore(frame.origin));
  await signIn();
  await page.goto(`${store.origin}/checkout`);

  // What the popup's pill knows about the store tab.
  const status = async () => {
    const popup = await context.newPage();
    await popup.goto(`chrome-extension://${extensionId}/popup/popup.html`);
    const tab = await popup.evaluate(async (pattern) => {
      const [tab] = await chrome.tabs.query({ url: pattern });
      return (await chrome.runtime.sendMessage({ type: "STORE_SETUP_STATUS", tabId: tab.id })).tab;
    }, `${store.origin}/*`);
    await popup.close();
    await page.bringToFront();
    return tab;
  };
  // Before starting, the popup offers setup on this tab.
  expect(await status()).toEqual({ onStore: true, running: false });

  const panel = await startSetup(page);
  let p = await panel.onTitle("Set up Demo Outfitters");
  expect(p.shadowMode).toBe("closed");
  expect(await page.evaluate(() => document.querySelector("saverlly-store-setup")!.shadowRoot)).toBeNull();
  expect(await p.style("title", "color")).toBe("rgb(0, 0, 0)");
  expect(await p.style("title", "letterSpacing")).not.toBe("3px");
  expect(await p.style("title", "fontFamily")).not.toMatch(/Times New Roman/);
  await shot(page, "intro");

  // Pick the promo box: the store sees none of the click.
  await panel.press("start");
  await panel.onTitle("Is this the checkout page?");
  await panel.press("next");
  await panel.onTitle("Can you see the promo code box?");
  await panel.press("visible");
  await panel.onTitle("Click the promo code box");
  await page.hover('input[name="discount"]');
  await shot(page, "hover");
  await page.evaluate(() => (window.__storeEvents = []));
  await page.click('input[name="discount"]');
  p = await panel.onDetail('input[name="discount"]');
  expect(await p.text("result")).toBe("Promo code box selected.");
  expect(await page.evaluate(() => window.__storeEvents)).toEqual([]);
  await shot(page, "picked");

  // Reload: the panel comes back on the same step with the same pick.
  await page.reload();
  await panel.onDetail('input[name="discount"]');

  // Choose again, then click into the other-origin frame: explained, not recorded.
  await panel.press("redo");
  await waitFor(async () => {
    const q = await panel.read();
    return (await q.text("title")) === "Click the promo code box" && !(await q.text("detail"));
  }, "pick mode again");
  await page.frameLocator("#pay").locator("input").click();
  await panel.onResult(/inside a separate frame/);
  await shot(page, "frame");

  // The panel's own controls still work while picking.
  await panel.press("Move this panel to the other side");

  // Stop: the panel goes, the tab is out of setup, and the page gets its clicks again.
  await panel.press("Stop setup on this page");
  await panel.closed();
  expect(await status()).toEqual({ onStore: true, running: false });
  await page.evaluate(() => (window.__storeEvents = []));
  await page.click('input[name="discount"]');
  expect(await page.evaluate(() => window.__storeEvents)).toContain("click:discount");
  await shot(page, "stopped");
});
