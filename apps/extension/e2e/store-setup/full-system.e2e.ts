// The whole system: the real dashboard issues a setup code, the extension redeems it on its
// options page, the admin walks all eight steps, sends the draft and saves it on the dashboard;
// the backend must then hold exactly the tested recipe.
//
// Opt-in: needs a backend and dashboard on a throwaway database seeded by seed-full-system.js,
// and SETUP_E2E_MERCHANT_ID set to the id it prints. See README.md.
import { expect, test } from "./fixtures";
import { shopifyStore } from "./stores";

const MERCHANT_ID = process.env.SETUP_E2E_MERCHANT_ID;
const DASHBOARD = process.env.SETUP_E2E_DASHBOARD ?? "http://localhost:3001";
const API = process.env.SETUP_E2E_API ?? "http://127.0.0.1:3000";
const ADMIN = { email: "s4-admin@saverlly.test", password: "S4-Admin-Pass-123!" };

test.skip(!MERCHANT_ID, "Set SETUP_E2E_MERCHANT_ID to run against a real backend and dashboard");

test("dashboard code → extension setup → saved recipe", async ({ context, page, extensionId, startSetup, serveStore, shot }) => {
  test.setTimeout(240_000);
  const store = await serveStore(shopifyStore);

  // 1. The admin signs in to the dashboard and gets a setup code for the store.
  const dash = page;
  await dash.goto(`${DASHBOARD}/admin/login`);
  await dash.fill("#email", ADMIN.email);
  await dash.fill("#password", ADMIN.password);
  await dash.click('button[type="submit"]');
  await dash.waitForURL((url) => !url.pathname.includes("/login"), { timeout: 90_000 });
  await dash.goto(`${DASHBOARD}/admin/merchants/${MERCHANT_ID}`);
  await dash.getByRole("button", { name: "Get setup code" }).click({ timeout: 90_000 });
  const code = (await dash.locator("#store-setup code").textContent())!.trim();

  // 2. The extension redeems it on its options page.
  const options = await context.newPage();
  await options.goto(`chrome-extension://${extensionId}/options/options.html`);
  await options.fill("#setup-code", code);
  await options.click("#setup-submit");
  await options.waitForSelector("#setup-end");

  // 3. All eight steps on the store's checkout.
  const checkout = await context.newPage();
  await checkout.goto(`${store.origin}/checkouts/c/8f2a9b1c4d5e6f708192/information`);
  const panel = await startSetup(checkout);
  await panel.onTitle("Set up Demo Outfitters");
  await panel.press("start");
  await panel.onTitle("Is this the checkout page?");
  await panel.press("next");
  await panel.onTitle("Can you see the promo code box?");
  await panel.press("link");
  await panel.onTitle("Click the link that opens the promo box");
  await checkout.click("#toggle");
  await panel.onDetail("#toggle");
  await panel.press("next");
  await panel.onTitle("Click the promo code box");
  await checkout.click("#ReductionsInput0");
  await panel.onDetail('input[name="reductions"]');
  await panel.press("next");
  await panel.onTitle("Click the apply button");
  await panel.press("yes");
  await panel.onDetail('button[aria-label="Apply Discount Code"]');
  await panel.press("next");
  await panel.onTitle("Click the order total");
  await checkout.click("strong.notranslate");
  await panel.onDetail("strong.notranslate");
  await panel.press("next");
  await panel.onTitle("Learn the store's error message");
  await panel.press("run");
  await panel.onTitle("Is this the store's error message?");
  await panel.press("yes");
  await panel.onDetail("#error-for-reductions");
  await panel.press("next");
  await panel.onTitle("Try a code that works (optional)");
  await panel.press("start");
  await panel.onTitle("Apply your code");
  await checkout.fill("#ReductionsInput0", "SAVE10");
  await checkout.click('button[aria-label="Apply Discount Code"]');
  await expect(checkout.locator("strong.notranslate")).toHaveText("$74.20");
  await panel.press("done");
  await panel.onTitle("Is this how the store shows the code was applied?");
  await panel.press("yes");
  await panel.onTitle("Is this how a shopper removes the code?");
  await panel.press("yes");
  await panel.onTitle("Working code");
  await panel.press("next");

  // 4. Test and send.
  await panel.onTitle("Test and send");
  await panel.press("run");
  await panel.onTitle("The recipe works", 20_000);
  await shot(checkout, "test-passed");
  await panel.press("send");
  await panel.onTitle("Sent to the dashboard", 15_000);

  // 5. The dashboard picks it up and the admin saves it.
  await dash.bringToFront();
  await dash.getByText("Ready to save").waitFor({ timeout: 20_000 });
  await dash.getByText("Message for a rejected code").waitFor();
  await shot(dash, "dashboard-result");
  await dash.getByRole("button", { name: "Save recipe to store" }).click();
  await dash.getByText(/Last set up with the extension/).waitFor({ timeout: 20_000 });
  await expect(dash.locator("#recipe-coupon-field")).toHaveValue('input[name="reductions"]');
  await shot(dash, "dashboard-saved");

  // 6. The backend holds exactly the recipe that was tested.
  const login = await (await fetch(`${API}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(ADMIN),
  })).json();
  const merchant = await (await fetch(`${API}/merchants/${MERCHANT_ID}`, { headers: { Authorization: `Bearer ${login.accessToken}` } })).json();
  expect(merchant.checkoutRecipe).toEqual({
    couponFieldSelector: 'input[name="reductions"]',
    applyButtonSelector: 'button[aria-label="Apply Discount Code"]',
    cartTotalSelector: "strong.notranslate",
    checkoutUrlPatterns: ["/checkouts/c"],
    couponFieldRevealSelector: "#toggle",
    failureIndicatorSelector: "#error-for-reductions",
    successIndicatorSelector: "span.tag__code",
    couponApplyMode: "remove",
    removeCouponSelector: "span.tag button",
  });

  // 7. Finish: the panel goes.
  await checkout.bringToFront();
  await panel.press("stop");
  await panel.closed();
});
