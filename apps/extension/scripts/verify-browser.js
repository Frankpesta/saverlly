// Real unpacked-extension integration test plus deterministic Figma-state screenshots.
// Run after build: node apps/extension/scripts/verify-browser.js
const { chromium } = require("playwright");
const http = require("http");
const fs = require("fs");
const path = require("path");
const assert = require("node:assert/strict");
const { pathToFileURL } = require("url");
const root = path.resolve(__dirname, "..");
const output = path.resolve(root, "../../coverage/extension-verification");
fs.mkdirSync(output, { recursive: true });
const coupon = (code, index) => ({
  id: `c${index}`,
  merchantId: "m1",
  code,
  description: `${index === 2 ? 36 : 20}% off Select Products.`,
  discountType: "percent",
  discountValue: index === 2 ? 36 : 20,
  successCount: 0,
  failCount: 0,
  active: true,
  source: "MANUAL",
  lastTestedAt: null,
  expiresAt: null,
});
const coupons = ["G0GET20", "EVERYTHING", "May-36"].map(coupon);
const state = {
  merchantId: "m1",
  merchantName: "Test store",
  coupons,
  suppressedStepdown: false,
  applyProgress: null,
  applyResult: null,
};
const result = {
  type: "COUPON_APPLY_RESULT",
  merchantId: "m1",
  couponId: "c1",
  code: "EVERYTHING",
  result: "applied",
  isFinal: true,
  discountAmount: 16,
  originalTotal: 79.99,
  newTotal: 63.99,
};
const recipe = {
  couponApplyMode: "replace",
  couponFieldSelector: 'input[name="promoCode"]',
  applyButtonSelector: '[data-testid="apply-promo"]',
  successIndicatorSelector: ".promo-success-message",
  failureIndicatorSelector: ".promo-error-message",
  cartTotalSelector: ".order-summary-total",
  checkoutUrlPatterns: ["/checkout"],
};
const merchant = {
  id: "m1",
  name: "Test store",
  domain: "127.0.0.1",
  active: true,
  attributionMethod: "COOKIE",
  affiliateTrackingUrl: null,
  affiliateSubIdParamKey: null,
  affiliateUrlParamKey: null,
  affiliateUrlParamValue: null,
  checkoutRecipe: recipe,
  coupons: [
    coupon("BAD", 0),
    coupon("WORKS10", 1),
    coupon("BEST30", 2),
    coupon("LAST20", 3),
  ],
};
const events = [];
let reportingAvailable = false;
const server = http.createServer((req, res) => {
  if (req.url.split("?")[0] === "/allbirds-checkout") {
    res.setHeader("Content-Type", "text/html");
    return res.end(
      fs.readFileSync(path.join(root, "src/test/mock-allbirds-checkout.html")),
    );
  }
  if (req.url.split("?")[0] === "/cart") {
    res.setHeader("Content-Type", "text/html");
    return res.end(
      fs.readFileSync(path.join(root, "src/test/mock-reveal-checkout.html")),
    );
  }
  if (req.url.split("?")[0] === "/checkout") {
    res.setHeader("Content-Type", "text/html");
    return res.end(
      fs.readFileSync(path.join(root, "src/test/mock-checkout.html")),
    );
  }
  res.setHeader("Content-Type", "application/json");
  if (req.url.includes("/merchants/by-domain/"))
    return res.end(JSON.stringify(merchant));
  if (req.url.includes("/status"))
    return res.end(
      JSON.stringify({ kioskStatus: "ACTIVE", deviceActive: true }),
    );
  if (req.url.includes("/savings"))
    return res.end(JSON.stringify({ lifetimeSaved: 1582.32 }));
  if (req.url.includes("/promotions/active")) return res.end("[]");
  if (req.url.includes("/coupon-test-events")) {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      events.push(JSON.parse(body));
      res.statusCode = reportingAvailable ? 201 : 503;
      res.end("{}");
    });
    return;
  }
  res.statusCode = 404;
  res.end("{}");
});

(async () => {
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  // Isolate the hardware boundary: never connect this fixture to a registered desktop
  // native host or production API on the machine running the test.
  const fixtureRoot = path.join(output, "unpacked-test");
  fs.cpSync(path.join(root, "dist"), fixtureRoot, { recursive: true });
  const workerFile = path.join(fixtureRoot, "background/service-worker.js");
  fs.writeFileSync(
    workerFile,
    `chrome.runtime.connectNative = () => ({ onMessage: { addListener() {} }, onDisconnect: { addListener() {} } });\nconst fixtureFetch = globalThis.fetch; globalThis.fetch = (url, init) => String(url).startsWith(${JSON.stringify(base + "/")}) ? fixtureFetch(url, init) : Promise.reject(new Error('Non-fixture network blocked'));\n` +
      fs.readFileSync(workerFile, "utf8"),
  );
  let browser;
  try {
    if (!process.argv.includes("--visual-only")) {
      browser = await chromium.launchPersistentContext("", {
        channel: "chromium",
        headless: true,
        viewport: { width: 800, height: 700 },
        args: [
          `--disable-extensions-except=${fixtureRoot}`,
          `--load-extension=${fixtureRoot}`,
        ],
      });
      const worker =
        browser.serviceWorkers()[0] ||
        (await browser.waitForEvent("serviceworker"));
      const id = new URL(worker.url()).host;
      await worker.evaluate(async () => {
        for (let i = 0; i < 100; i++) {
          if ((await chrome.storage.local.get("dormant")).dormant === true)
            return;
          await new Promise((resolve) => setTimeout(resolve, 50));
        }
        throw new Error("Initial install status did not settle");
      });
      await worker.evaluate(
        async ({ apiBaseUrl }) => {
          await chrome.storage.local.set({
            apiBaseUrl,
            deviceToken: "local-test-token",
            dormant: false,
            lastStatusOkAt: Date.now(),
          });
        },
        { apiBaseUrl: base },
      );
      const checkout = await browser.newPage();
      const errors = [];
      checkout.on("pageerror", (error) => errors.push(error.message));
      await checkout.goto(`${base}/checkout`);
      await checkout.bringToFront();
      const tabId = await worker.evaluate(
        async (url) =>
          (await chrome.tabs.query({})).find((tab) => tab.url === url).id,
        `${base}/checkout`,
      );
      await checkout.waitForFunction(() => !!document.querySelector("input"));
      // Wait on persisted state written by the real navigation/detector/message pipeline.
      for (let i = 0; i < 100; i++) {
        if (
          await worker.evaluate(
            async (id) =>
              !!(await chrome.storage.session.get(`tabState:${id}`))[
                `tabState:${id}`
              ],
            tabId,
          )
        )
          break;
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      assert(
        await worker.evaluate(
          async (id) =>
            !!(await chrome.storage.session.get(`tabState:${id}`))[
              `tabState:${id}`
            ],
          tabId,
        ),
        "Checkout detection did not persist state",
      );
      const popup = await browser.newPage();
      await checkout.bringToFront();
      await popup.goto(`chrome-extension://${id}/popup/popup.html`);
      await popup.locator("#apply-btn").waitFor();
      assert.equal(
        await worker.evaluate(
          async () =>
            (
              (await chrome.storage.local.get("attributionLog"))
                .attributionLog || []
            ).length,
        ),
        0,
        "Attribution must not happen on page visit",
      );
      await popup.locator("#apply-btn").click();
      await popup.locator("#checkout-btn").waitFor({ timeout: 15000 });
      assert.match(await popup.locator("#content").innerText(), /\$30.00/);
      assert.match(
        await checkout.locator(".order-summary-total").innerText(),
        /70.00/,
      );
      assert.equal(await checkout.locator(".promo-success-message").count(), 1);
      assert.equal(await checkout.locator(".promo-error-message").count(), 1);
      assert.deepEqual(errors, []);
      await popup.reload();
      await popup.locator("#checkout-btn").waitFor();
      await popup.locator("#view-coupons-btn").click();
      assert.equal(await popup.locator(".popup__coupon-row").count(), 4);
      await popup.locator("#back-btn").click();
      await popup.locator("#checkout-btn").waitFor();
      assert(
        await worker.evaluate(async () =>
          Object.entries(await chrome.storage.local.get(null)).some(
            ([key, value]) =>
              key.startsWith("couponEvent:") &&
              value.payload.result === "applied",
          ),
        ),
        "Savings must remain queued during outage",
      );
      reportingAvailable = true;
      await worker.evaluate(() =>
        chrome.alarms.create("saverlly-recovery", { when: Date.now() + 100 }),
      );
      for (
        let i = 0;
        i < 100 && !events.some((event) => event.result === "applied");
        i++
      )
        await new Promise((resolve) => setTimeout(resolve, 100));
      assert(
        events.some((event) => event.result === "applied"),
        "Recovery must report queued savings",
      );
      assert.equal(
        events.filter((event) => event.result === "applied").length,
        1,
      );
      assert.deepEqual(await checkout.evaluate(() => window.testedCodes), [
        "BAD",
        "WORKS10",
        "BEST30",
        "LAST20",
        "BEST30",
      ]);
      assert.equal(
        await worker.evaluate(
          async () =>
            (
              (await chrome.storage.local.get("attributionLog"))
                .attributionLog || []
            ).length,
        ),
        1,
      );
      console.log(
        "PASS real extension: detection → popup → failed code → successful code → result despite reporting outage → reopen → coupon list → back",
      );
      merchant.attributionMethod = "URL_PARAM";
      merchant.affiliateUrlParamKey = "aff";
      merchant.affiliateUrlParamValue = "review";
      await worker.evaluate(() => chrome.storage.local.remove("merchantCache"));
      const redirectCheckout = await browser.newPage();
      await redirectCheckout.goto(`${base}/checkout`);
      const redirectTabId = await worker.evaluate(
        async (url) =>
          (await chrome.tabs.query({})).filter((tab) => tab.url === url).at(-1)
            .id,
        `${base}/checkout`,
      );
      for (let i = 0; i < 100; i++) {
        if (
          await worker.evaluate(
            async (id) =>
              !!(await chrome.storage.session.get(`tabState:${id}`))[
                `tabState:${id}`
              ],
            redirectTabId,
          )
        )
          break;
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      const redirectPopup = await browser.newPage();
      await redirectCheckout.bringToFront();
      await redirectPopup.goto(`chrome-extension://${id}/popup/popup.html`);
      await redirectPopup.locator("#apply-btn").click();
      await redirectPopup.locator("#checkout-btn").waitFor({ timeout: 20000 });
      assert.equal(
        new URL(redirectCheckout.url()).searchParams.get("aff"),
        "review",
      );
      assert.match(
        await redirectCheckout.locator(".order-summary-total").innerText(),
        /70.00/,
      );
      assert.deepEqual(
        await redirectCheckout.evaluate(() => window.testedCodes),
        ["BAD", "WORKS10", "BEST30", "LAST20", "BEST30"],
      );
      console.log(
        "PASS explicit Apply attribution: URL redirect resumes the authorized comparison exactly once",
      );
      merchant.attributionMethod = "COOKIE";
      merchant.affiliateUrlParamKey = null;
      merchant.affiliateUrlParamValue = null;
      merchant.checkoutRecipe = {
        ...recipe,
        couponFieldSelector: 'input[data-test=\\"promo-code-input\\"]',
        applyButtonSelector: 'button[data-test=\\"apply-promo-code-button\\"]',
        cartTotalSelector: '[data-test=\\"cart-summary-total\\"]',
        couponFieldRevealSelector: "#add-promo-code-btn",
        successIndicatorSelector: "",
        failureIndicatorSelector: "#promoCodeEntry--ErrorMessage",
        checkoutUrlPatterns: ["/cart"],
        couponApplyMode: undefined,
      };
      merchant.coupons = [coupon("BAD", 0), coupon("WORKS10", 1)];
      await worker.evaluate(() => chrome.storage.local.remove("merchantCache"));
      const targetCheckout = await browser.newPage();
      await targetCheckout.goto(`${base}/cart`);
      await targetCheckout.bringToFront();
      const targetPopup = await browser.newPage();
      await targetCheckout.bringToFront();
      await targetPopup.goto(`chrome-extension://${id}/popup/popup.html`);
      await targetPopup.locator("#apply-btn").waitFor({ timeout: 15000 });
      await targetPopup.locator("#apply-btn").click();
      await targetPopup.locator("#checkout-btn").waitFor({ timeout: 25000 });
      assert.match(
        await targetPopup.locator("#content").innerText(),
        /\$10.00/,
      );
      assert.equal(
        await targetCheckout.locator("input").inputValue(),
        "WORKS10",
      );
      console.log(
        "PASS Target-style cart: escaped selectors, delayed reveal, no success banner, slow response, and first confirmed saving",
      );
      merchant.coupons = [
        coupon("SAVE20", 0),
        coupon("SAVENOW", 1),
        coupon("STYLE", 2),
        coupon("SAVE5", 3),
      ];
      await worker.evaluate(() => chrome.storage.local.remove("merchantCache"));
      const retryCheckout = await browser.newPage();
      await retryCheckout.goto(`${base}/cart?cached=1`);
      const retryPopup = await browser.newPage();
      await retryCheckout.bringToFront();
      await retryPopup.goto(`chrome-extension://${id}/popup/popup.html`);
      await retryPopup.locator("#apply-btn").click();
      for (let run = 0; run < 2; run++) {
        await retryPopup
          .getByText("No working codes found", { exact: true })
          .waitFor({ timeout: 15000 });
        assert.match(
          await retryPopup.locator("#content").innerText(),
          /We tried 4 codes/,
        );
        if (run === 0) await retryPopup.locator("#retry-btn").click();
      }
      assert.deepEqual(await retryCheckout.evaluate(() => window.testedCodes), [
        "SAVE20",
        "SAVENOW",
        "STYLE",
        "SAVE5",
        "SAVE20",
        "SAVENOW",
        "STYLE",
        "SAVE5",
      ]);
      console.log(
        "PASS Target-style repeated comparison: all four cached rejections complete on both runs",
      );
      merchant.checkoutRecipe = {
        couponApplyMode: "remove",
        removeCouponSelector: 'button[data-event-name="remove_discount_code"]',
        couponFieldSelector: 'input[name="reductions"]',
        applyButtonSelector: 'button[aria-label="Apply Discount Code"]',
        successIndicatorSelector:
          'button[data-event-name="remove_discount_code"]',
        failureIndicatorSelector: '[id^="error-for-ReductionsInput"]',
        cartTotalSelector:
          '[role="table"][aria-labelledby^="MoneyLine-Heading"] [role="row"]:last-child [role="cell"]',
        checkoutUrlPatterns: ["/allbirds-checkout"],
      };
      const allbirdsCodes = [
        "COMEBACK10",
        "TIM",
        "ALL16",
        "SAVE16",
        "WELCOME10",
        "THANKYOU10",
        "freetry75",
      ];
      merchant.coupons = allbirdsCodes.map(coupon);
      await worker.evaluate(() => chrome.storage.local.remove("merchantCache"));
      const allbirdsCheckout = await browser.newPage();
      await allbirdsCheckout.goto(`${base}/allbirds-checkout`);
      const allbirdsPopup = await browser.newPage();
      await allbirdsCheckout.bringToFront();
      await allbirdsPopup.goto(`chrome-extension://${id}/popup/popup.html`);
      await allbirdsPopup.locator("#apply-btn").click();
      await allbirdsPopup.locator("#checkout-btn").waitFor({ timeout: 30000 });
      assert.match(
        await allbirdsPopup.locator("#content").innerText(),
        /We tried 7 codes/,
      );
      assert.match(
        await allbirdsPopup.locator("#content").innerText(),
        /\$14.00/,
      );
      const firstRun = await allbirdsCheckout.evaluate(() =>
        window.testedCodes.slice(),
      );
      assert.deepEqual(
        firstRun.filter((code) => code !== "REMOVE"),
        [...allbirdsCodes, "COMEBACK10"],
      );
      await allbirdsPopup.locator("#view-coupons-btn").click();
      await allbirdsPopup.locator("#retry-btn").click();
      await allbirdsPopup.locator("#checkout-btn").waitFor({ timeout: 30000 });
      assert.match(
        await allbirdsPopup.locator("#content").innerText(),
        /We tried 7 codes/,
      );
      assert.deepEqual(
        (await allbirdsCheckout.evaluate(() => window.testedCodes))
          .slice(firstRun.length)
          .filter((code) => code !== "REMOVE"),
        [...allbirdsCodes, "COMEBACK10"],
      );
      assert.equal(
        await allbirdsCheckout
          .locator('button[data-event-name="remove_discount_code"]')
          .textContent(),
        "COMEBACK10",
      );
      await allbirdsPopup.reload();
      await allbirdsPopup.locator("#checkout-btn").waitFor();
      assert.match(
        await allbirdsPopup.locator("#content").innerText(),
        /\$126.00/,
      );
      const allbirdsTabId = await worker.evaluate(
        async (url) =>
          (await chrome.tabs.query({})).find((tab) => tab.url === url).id,
        `${base}/allbirds-checkout`,
      );
      const retryResult = await worker.evaluate(
        async (tabId) =>
          (await chrome.storage.session.get(`tabState:${tabId}`))[
            `tabState:${tabId}`
          ].applyResult,
        allbirdsTabId,
      );
      assert.equal(
        retryResult.incrementalSavings,
        0,
        "Retry must not recount an already-present discount",
      );
      console.log(
        "PASS Allbirds-style checkout: existing chip, appended savings row, animated totals, seven codes, winner reapplication, retry, and popup reopen",
      );
      await browser.close();
      browser = null;
    }

    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      viewport: { width: 360, height: 600 },
      deviceScaleFactor: 1,
    });
    for (const view of [
      "idle",
      "suppressed",
      "applying",
      "applying-best",
      "success",
      "coupon-list",
      "no-offer",
      "failure",
    ]) {
      const page = await context.newPage();
      let fixture = JSON.parse(JSON.stringify(state));
      if (view === "idle") fixture.coupons[0].description += " Free Shipping";
      if (view === "suppressed") fixture.suppressedStepdown = true;
      if (view.startsWith("applying"))
        fixture.applyProgress = {
          type: "COUPON_APPLY_PROGRESS",
          phase: view === "applying-best" ? "applying" : "testing",
          code: "EVERYTHING",
          index: 2,
          total: 12,
        };
      if (view === "success" || view === "coupon-list")
        fixture.applyResult = result;
      if (view === "failure")
        fixture.applyResult = { ...result, result: "failed" };
      if (view === "no-offer") fixture = null;
      await page.addInitScript((fixture) => {
        window.chrome = {
          runtime: {
            sendMessage: async (message) =>
              ({
                GET_TAB_STATE: fixture,
                GET_LIFETIME_SAVED: 1582.32,
                GET_ACTIVE_PROMOTIONS: [],
              })[message.type],
            onMessage: { addListener() {} },
            getURL: (p) => p,
          },
          tabs: { query: async () => [{ id: 1 }], create: async () => {} },
        };
      }, fixture);
      await page.goto(
        `file:///${path.join(root, "dist/popup/popup.html").replaceAll("\\", "/")}`,
      );
      await page.waitForFunction(
        () => document.querySelector("#content").dataset.view,
      );
      await page.evaluate(() => document.fonts.ready);
      if (view === "coupon-list")
        await page.locator("#view-coupons-btn").click();
      assert.equal(
        await page.evaluate(() => document.documentElement.scrollWidth),
        360,
        `${view} horizontal overflow`,
      );
      await page.screenshot({
        path: path.join(output, `${view}.png`),
        fullPage: true,
      });
      const boxes = await page
        .locator(
          ".popup__header, .popup__lifetime, .popup__heading, .popup__progress-card, .popup__result-card, .popup__button",
        )
        .evaluateAll((nodes) =>
          nodes.map((node) => ({
            class: node.className,
            x: node.getBoundingClientRect().x,
            y: node.getBoundingClientRect().y,
            width: node.getBoundingClientRect().width,
            height: node.getBoundingClientRect().height,
          })),
        );
      fs.writeFileSync(
        path.join(output, `${view}.json`),
        JSON.stringify(boxes, null, 2),
      );
      await page.close();
    }
    console.log(
      `PASS eight popup states rendered without horizontal overflow. Screenshots: ${output}`,
    );
    if (process.argv[2]) {
      const references = {
        idle: "Pop Up",
        suppressed: "No Pop Up (When user clicks on the extention)",
        applying: "Applying And Testing The Codes",
        "applying-best": "Applying And Testing The Codes (1)",
        success: "Codes Applied Successfully",
        "coupon-list": "5",
      };
      const panels = Object.entries(references)
        .map(
          ([view, name]) =>
            `<section><h2>${view}</h2><div><figure><figcaption>Figma export at 60%</figcaption><img src="${pathToFileURL(path.join(process.argv[2], `${name}.png`)).href}" width="360"></figure><figure><figcaption>Implementation · live data varies</figcaption><img src="${view}.png" width="360"></figure></div></section>`,
        )
        .join("");
      fs.writeFileSync(
        path.join(output, "comparison.html"),
        `<!doctype html><meta charset="utf-8"><title>Extension design comparison</title><style>body{font:14px system-ui;background:#e9ecef;margin:24px}h1{font-size:24px}section{display:inline-block;vertical-align:top;margin:0 20px 24px 0}section div{display:flex;gap:12px}figure{margin:0}figcaption{padding:8px;background:white}img{display:block}</style><h1>Saverlly extension — Figma comparison</h1><p>Settings and accounts intentionally omitted. Affiliate disclosure and live coupon values retained.</p>${panels}`,
      );
    }
  } finally {
    if (browser) await browser.close();
    server.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
