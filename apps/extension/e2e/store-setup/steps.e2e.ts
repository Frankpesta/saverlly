// All guided steps on the two kinds of store checkout answers come in: in place (Shopify-style)
// and on a reloaded page (WooCommerce classic).
import { expect, test, waitFor } from "./fixtures";
import { shopifyStore, wooStore } from "./stores";

test("a Shopify-style store: all eight steps, with a working code and removal proven", async ({ page, signIn, startSetup, progressOf, serveStore, shot }) => {
  const store = await serveStore(shopifyStore);
  await signIn();
  await page.goto(`${store.origin}/checkouts/c/8f2a9b1c4d5e6f708192/information`);
  const panel = await startSetup(page);

  await panel.onTitle("Set up Demo Outfitters");
  await panel.press("start");
  let p = await panel.onTitle("Is this the checkout page?");
  expect(await p.text("result")).toBe("Pages whose address contains /checkouts/c");
  await panel.press("next");

  // The promo box hides behind a link; clicking it is the one pick the store does see.
  await panel.onTitle("Can you see the promo code box?");
  await panel.press("link");
  await panel.onTitle("Click the link that opens the promo box");
  await page.evaluate(() => { window.__storeEvents = []; window.__storeCapture = []; });
  await page.click("#toggle");
  await panel.onDetail("#toggle");
  await expect(page.locator("#ReductionsInput0")).toBeVisible();
  expect(await page.evaluate(() => window.__storeEvents)).toContain("click:toggle");
  await panel.press("next");

  // Reload mid-setup: the box is hidden again, so the panel offers to open it.
  await panel.onTitle("Click the promo code box");
  await page.reload();
  await panel.onTitle("Click the promo code box");
  await expect(page.locator("#ReductionsInput0")).toBeHidden();
  await panel.press("open");
  await expect(page.locator("#ReductionsInput0")).toBeVisible();
  await page.evaluate(() => { window.__storeEvents = []; window.__storeCapture = []; });
  await page.click('label[for="ReductionsInput0"]');
  await panel.onDetail('input[name="reductions"]');
  await panel.press("next");

  p = await panel.onTitle("Click the apply button");
  expect(await p.text("body")).toBe("Is the outlined item the apply button?");
  await shot(page, "apply-suggestion");
  await panel.press("yes");
  await panel.onDetail('button[aria-label="Apply Discount Code"]');
  await panel.press("next");

  await panel.onTitle("Click the order total");
  await page.click("text=Subtotal");
  await panel.onResult(/doesn't look like a price/);
  await page.click("strong.notranslate");
  p = await panel.onDetail("strong.notranslate");
  expect(await p.text("result")).toBe("Order total selected: $84.20");
  // Apart from the link, the store saw nothing of the admin's choosing: no page element in any
  // phase, and not even the panel host in the bubble phase.
  expect(await page.evaluate(() => window.__storeEvents)).toEqual([]);
  const capture = await page.evaluate(() => window.__storeCapture);
  expect(capture.every((entry) => entry.endsWith(":saverlly-store-setup")), capture.join(", ")).toBe(true);
  await panel.press("next");

  // The extension submits a made-up code itself to learn the error message.
  await panel.onTitle("Learn the store's error message");
  await panel.press("run");
  p = await panel.onTitle("Is this the store's error message?");
  expect(await p.text("result")).toBe('"Enter a valid discount code or gift card"');
  await expect(page.locator("#ReductionsInput0")).toHaveValue(/^SAVERLLY-TEST-[A-Z2-9]{4}$/);
  await panel.press("yes");
  await panel.onDetail("#error-for-reductions");
  await panel.press("next");
  await expect(page.locator("#ReductionsInput0"), "the test code was cleared").toHaveValue("");

  // A working code, applied by the admin through the store's own box and button.
  await panel.onTitle("Try a code that works (optional)");
  await panel.press("start");
  await panel.onTitle("Apply your code");
  await page.fill("#ReductionsInput0", "SAVE10");
  await page.click('button[aria-label="Apply Discount Code"]');
  await expect(page.locator("strong.notranslate")).toHaveText("$74.20");
  await panel.press("done");
  p = await panel.onTitle("Is this how the store shows the code was applied?");
  expect(await p.text("result")).toBe('"SAVE10"');
  await panel.press("yes");
  p = await panel.onTitle("Is this how a shopper removes the code?");
  expect(await p.text("result")).toBe('"Remove SAVE10"');
  await shot(page, "remove-control");
  await panel.press("yes");
  await panel.onTitle("Working code");
  await expect(page.locator("strong.notranslate"), "Saverlly removed the code again").toHaveText("$84.20");
  await panel.press("next");
  await panel.onTitle("Test and send");

  expect(await progressOf(page)).toEqual({
    version: 2, step: 8, pattern: "/checkouts/c", reveal: "link", realCode: "done", applyMode: "remove", codeStillApplied: false,
    picks: {
      revealLink: { selector: "#toggle", strategy: "id", exact: true },
      promoField: { selector: 'input[name="reductions"]', strategy: "attribute", exact: true },
      applyButton: { selector: 'button[aria-label="Apply Discount Code"]', strategy: "attribute", exact: true },
      cartTotal: { selector: "strong.notranslate", strategy: "class", exact: true },
      failureMessage: { selector: "#error-for-reductions", strategy: "id", exact: true },
      successMessage: { selector: "span.tag__code", strategy: "class", exact: true },
      removeControl: { selector: "span.tag button", strategy: "scoped", exact: true },
    },
  });

  // The final test runs the recipe from scratch through the shopper's own code.
  await panel.press("run");
  p = await panel.onTitle("The recipe works", 20_000);
  expect(await p.notes()).toEqual([
    "✓ Checkout page: Runs on pages whose address contains /checkouts/c.",
    "✓ Promo code link: Opens the promo box.",
    "✓ Promo code box: Found the promo code box.",
    "✓ Apply button: Found the apply button.",
    "✓ Order total: Read the order total: 84.20.",
    "✓ Message for a rejected code: The store rejected the test code, and Saverlly recognised its message.",
    "✓ Message for an accepted code: Found when your working code was applied.",
    "✓ Trying one code after another: Removing a code restores the total, so Saverlly can safely compare codes.",
  ]);
  await shot(page, "test-passed");
});

test("a WooCommerce-classic store: the error message is found on the reloaded page", async ({ page, signIn, startSetup, progressOf, serveStore, shot }) => {
  const store = await serveStore(wooStore);
  await signIn();
  await page.goto(`${store.origin}/checkout/`);
  const panel = await startSetup(page);
  // The page carries WooCommerce's own markup, so setup starts from WooCommerce's template.
  await panel.onTitle("Set up Demo Outfitters");
  await panel.press("start");
  await panel.onTitle("Found WooCommerce's checkout");
  await panel.press("next");

  await panel.onTitle("Learn the store's error message");
  const navigated = page.waitForURL(/coupon_code=SAVERLLY-TEST-/);
  await panel.press("run");
  await navigated;
  // A brand-new page: the panel is injected again and finds the server's answer without
  // submitting a second time.
  const p = await panel.onTitle("Is this the store's error message?", 15_000);
  expect(await p.text("result")).toMatch(/^"Coupon "SAVERLLY-TEST-[A-Z2-9]{4}" does not exist!"$/);
  await shot(page, "after-reload");
  await panel.press("yes");
  await panel.onDetail("ul.woocommerce-error");

  const progress = (await progressOf(page)) as { pendingTest?: unknown; picks: Record<string, unknown> };
  expect(progress.pendingTest).toBeUndefined();
  expect(progress.picks).toMatchObject({
    promoField: { selector: "#coupon_code" },
    applyButton: { selector: 'button[name="apply_coupon"]' },
    failureMessage: { selector: "ul.woocommerce-error", strategy: "class", exact: true },
  });

  // The final test's code reloads the page too, which the shopper run can't survive: it fails
  // with a plain explanation instead of a false pass.
  await panel.press("next");
  await panel.onTitle("Try a code that works (optional)");
  await panel.press("skip");
  await panel.onTitle("Working code");
  await panel.press("next");
  await panel.onTitle("Test and send");
  await panel.press("run");
  const result = await panel.onTitle("Some checks didn't pass", 20_000);
  const notes = await result.notes();
  expect(notes.find((n) => n.includes("Message for a rejected code"))).toMatch(/^✗ .*reloaded the page/);
  await waitFor(async () => page.url().includes("coupon_code="), "the store's reload");
});
