// A store that holds one code at a time: once a code is applied, the promo box goes away and only
// a "Remove" link is left. Comparing codes there depends entirely on removal working, so Saverlly
// may only switch it on when it has seen the remove link restore the total.
import { expect, pickBasics, test } from "./fixtures";
import { oneCodeStore } from "./stores";

test("removal that restores the total switches on comparing codes", async ({ page, signIn, startSetup, progressOf, serveStore, shot }) => {
  const store = await serveStore(oneCodeStore);
  await signIn();
  await page.goto(`${store.origin}/cart`);
  const panel = await startSetup(page);
  await pickBasics(panel, { field: "#coupon", total: ".grand-total" });

  await panel.onTitle("Learn the store's error message");
  await panel.press("run");
  let p = await panel.onTitle("Is this the store's error message?");
  expect(await p.text("result")).toBe(`"Sorry, that promo code isn't valid."`);
  await panel.press("yes");
  await panel.picked();
  await panel.press("next");

  await panel.onTitle("Try a code that works (optional)");
  await panel.press("start");
  await panel.onTitle("Apply your code");
  await page.fill("#coupon", "half");
  await page.click(".btn-apply");
  await expect(page.locator(".grand-total")).toHaveText("$25.00");
  await expect(page.locator("#coupon"), "the store hides its promo box while a code is applied").toBeHidden();
  await panel.press("done");
  p = await panel.onTitle("Is this how the store shows the code was applied?");
  await shot(page, "applied");
  await panel.press("yes");
  p = await panel.onTitle("Is this how a shopper removes the code?");
  expect(await p.text("result")).toBe('"Remove"');
  await panel.press("yes");
  p = await panel.onTitle("Working code");
  expect(await p.notes()).toContain("Removing a code: works. Saverlly can safely compare several codes.");
  await expect(page.locator(".grand-total")).toHaveText("$50.00");
  await expect(page.locator("#coupon"), "the promo box is back for the next code").toBeVisible();
  await panel.press("next");

  await panel.onTitle("Test and send");
  const progress = (await progressOf(page)) as { applyMode?: string; codeStillApplied?: boolean; picks: Record<string, unknown> };
  expect(progress.applyMode).toBe("remove");
  expect(progress.codeStillApplied).toBe(false);
  // The typed code (entered in lower case, shown in upper case) is kept out of every selector.
  expect(JSON.stringify(progress.picks)).not.toMatch(/half/i);

  await panel.press("run");
  p = await panel.onTitle("The recipe works", 20_000);
  expect(await p.notes()).toContain(
    "✓ Trying one code after another: Removing a code restores the total, so Saverlly can safely compare codes.",
  );
  await shot(page, "test-passed");
});

test("removal that doesn't restore the total is never trusted", async ({ page, signIn, startSetup, progressOf, serveStore }) => {
  const store = await serveStore(oneCodeStore);
  await signIn();
  await page.goto(`${store.origin}/cart?remove=broken`);
  const panel = await startSetup(page);
  await pickBasics(panel, { field: "#coupon", total: ".grand-total" });

  await panel.onTitle("Learn the store's error message");
  await panel.press("run");
  await panel.onTitle("Is this the store's error message?");
  await panel.press("yes");
  await panel.picked();
  await panel.press("next");

  await panel.onTitle("Try a code that works (optional)");
  await panel.press("start");
  await panel.onTitle("Apply your code");
  await page.fill("#coupon", "HALF");
  await page.click(".btn-apply");
  await expect(page.locator(".grand-total")).toHaveText("$25.00");
  await panel.press("done");
  await panel.onTitle("Is this how the store shows the code was applied?");
  await panel.press("yes");
  await panel.onTitle("Is this how a shopper removes the code?");
  await panel.press("yes");
  const p = await panel.onTitle("Working code", 20_000);
  expect(await p.notes()).toEqual(expect.arrayContaining([
    "Removing a code: not available. Saverlly will apply the first code that works.",
    "Your code is still applied in this cart. Remove it yourself if you like.",
  ]));

  const progress = (await progressOf(page)) as { applyMode?: string; codeStillApplied?: boolean; picks: Record<string, unknown> };
  expect(progress.applyMode).toBeUndefined();
  expect(progress.codeStillApplied).toBe(true);
  expect(progress.picks.removeControl).toBeUndefined();
});
