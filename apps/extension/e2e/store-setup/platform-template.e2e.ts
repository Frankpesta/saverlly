// Stores on a platform Saverlly has a template for: the parts of the checkout are filled in from
// the template, checked against the live page, and the admin only confirms and runs the test.
import { expect, MERCHANT, test } from "./fixtures";
import { shopifyTemplateStore, wooTemplateStore } from "./stores";

for (const { name, store, path, total } of [
  { name: "Shopify", store: shopifyTemplateStore, path: "/checkouts/cn/abc123/information", total: "84.20" },
  { name: "WooCommerce", store: wooTemplateStore, path: "/checkout/", total: "84.20" },
]) {
  test(`a ${name} store is set up from its template, with no part of the checkout clicked`, async ({ page, signIn, startSetup, progressOf, serveStore, shot }) => {
    const server = await serveStore(store);
    await signIn();
    await page.goto(`${server.origin}${path}`);
    const panel = await startSetup(page);

    let p = await panel.onTitle(`Set up ${MERCHANT.name}`);
    expect(await p.text("body")).toMatch(new RegExp(`^This store runs on ${name}, so Saverlly will fill in`));
    await panel.press("start");
    p = await panel.onTitle(`Found ${name}'s checkout`);
    expect((await p.notes()).every((note) => note.startsWith("✓"))).toBe(true);
    await shot(page, "template-found");
    await panel.press("next");

    await panel.onTitle("Learn the store's error message");
    await panel.press("run");
    await panel.onTitle("Is this the store's error message?");
    await panel.press("yes");
    await panel.picked();
    await panel.press("next");
    await panel.onTitle("Try a code that works (optional)");
    await panel.press("skip");
    await panel.onTitle("Working code");
    await panel.press("next");
    await panel.onTitle("Test and send");
    await panel.press("run");
    p = await panel.onTitle("The recipe works", 20_000);
    expect(await p.notes()).toContain(`✓ Order total: Read the order total: ${total}.`);
    await shot(page, "test-passed");

    const progress = (await progressOf(page)) as { platform?: string; picks: Record<string, { strategy: string }> };
    expect(progress.platform).toBe(name.toUpperCase());
    for (const key of ["promoField", "applyButton", "cartTotal"]) expect(progress.picks[key].strategy).toBe("template");
  });
}
