// The small test stores the suite serves on localhost. Each one copies how a real kind of
// checkout behaves, without any of the real store.
import http from "node:http";
import type { AddressInfo } from "node:net";

export interface TestServer {
  /** e.g. http://localhost:51234 */
  origin: string;
  close: () => Promise<void>;
}

/** Serves `page(url)` as HTML on a free port, so tests can run in parallel. */
export async function serve(page: (url: string) => string, host = "localhost"): Promise<TestServer> {
  const server = http.createServer((req, res) => {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(page(req.url ?? "/"));
  });
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const { port } = server.address() as AddressInfo;
  return {
    origin: `http://${host}:${port}`,
    close: () =>
      new Promise((resolve) => {
        server.close(() => resolve());
        server.closeAllConnections();
      }),
  };
}

declare global {
  interface Window {
    /** Clicks the store's scripts saw in the bubble phase, as "type:target". */
    __storeEvents: string[];
    /** The same in the capture phase. */
    __storeCapture: string[];
  }
}

/** Records every click the store's own scripts see, in both phases. */
const RECORD_EVENTS = `
  window.__storeEvents = []; window.__storeCapture = [];
  for (const type of ["pointerdown","mousedown","mouseup","click"]) {
    document.addEventListener(type, (e) => window.__storeEvents.push(type + ":" + (e.target.id || e.target.name || e.target.localName)));
    document.addEventListener(type, (e) => window.__storeCapture.push(type + ":" + (e.target.id || e.target.name || e.target.localName)), true);
  }`;

/** A store with aggressive global CSS and a payment frame from another origin. */
export const hostileStore = (frameOrigin: string) => () => `<!doctype html><html><head><title>Demo checkout</title><style>
  /* None of this may reach the setup panel. */
  * { font-family: "Times New Roman", serif !important; color: #c00 !important; letter-spacing: 3px !important; }
  button { background: purple !important; border-radius: 0 !important; }
  body { margin: 40px; }
</style></head><body>
  <h1>Checkout</h1>
  <form id="discount" onsubmit="event.preventDefault(); window.__submitted = (window.__submitted||0)+1">
    <input name="discount" placeholder="Discount code"> <button>Apply</button>
  </form>
  <p class="order-total">Total: $84.20</p>
  <p>Gift card (payment provider):</p>
  <iframe id="pay" src="${frameOrigin}/frame" style="width:300px;height:60px;border:1px solid #999"></iframe>
  <script>${RECORD_EVENTS}</script>
</body></html>`;

export const paymentFrame = () => `<!doctype html><input name="giftcard" placeholder="Gift card">`;

/**
 * Shopify-style: a link opens the promo box, classes are hashed, the total sits in a table, the
 * URL carries a session token, and the store answers in place. SAVE10 takes $10 off and shows a
 * tag with an × that removes it again.
 */
export const shopifyStore = () => `<!doctype html><html><head><meta charset="utf-8"><title>Checkout</title><style>
  * { font-family: Georgia, serif !important; } body { margin: 40px; }
</style></head><body>
  <h1>Checkout</h1>
  <a href="#" id="toggle">Have a promo code?</a>
  <div id="promo" hidden>
    <label for="ReductionsInput0">Discount code</label>
    <input id="ReductionsInput0" name="reductions" placeholder="Discount code or gift card">
    <button type="button" aria-label="Apply Discount Code" class="_1m2hr9ge _1m2hr9gd">Apply</button>
  </div>
  <div role="table"><div role="row"><span role="rowheader">Subtotal</span><span>$80.00</span></div>
  <div role="row"><span role="rowheader">Total</span><strong class="_19gi7yt0 notranslate">$84.20</strong></div></div>
  <script>
    document.getElementById("toggle").addEventListener("click", (e) => { e.preventDefault(); document.getElementById("promo").hidden = false; });
    document.querySelector('button[aria-label="Apply Discount Code"]').addEventListener("click", () => setTimeout(() => {
      const input = document.getElementById("ReductionsInput0");
      if (input.value === "SAVE10") {
        input.value = "";
        input.removeAttribute("aria-invalid");
        document.getElementById("error-for-reductions")?.remove();
        document.querySelector("strong.notranslate").textContent = "$74.20";
        const chip = document.createElement("span");
        chip.className = "_1x41w3p1 tag";
        chip.innerHTML = '<span class="tag__code">SAVE10</span> <button type="button" aria-label="Remove SAVE10" class="_1m2hr9ge">×</button>';
        document.getElementById("promo").append(chip);
        chip.querySelector("button").addEventListener("click", () => setTimeout(() => {
          chip.remove();
          document.querySelector("strong.notranslate").textContent = "$84.20";
        }, 400));
        return;
      }
      input.setAttribute("aria-invalid", "true");
      input.setAttribute("aria-describedby", "error-for-reductions");
      let p = document.getElementById("error-for-reductions");
      if (!p) { p = document.createElement("p"); p.id = "error-for-reductions"; p.className = "_1fragem2"; document.getElementById("promo").append(p); }
      p.textContent = "Enter a valid discount code or gift card";
    }, 500));
    ${RECORD_EVENTS}
  </script>
</body></html>`;

/** WooCommerce classic: applying a code submits a GET form and the reloaded page shows the answer. */
export const wooStore = (url: string) => {
  const coupon = new URL(url, "http://x").searchParams.get("coupon_code");
  const notice = coupon
    ? '<ul class="woocommerce-error" role="alert"><li>Coupon "' + coupon.replace(/[<&"]/g, "") + '" does not exist!</li></ul>'
    : "";
  return '<!doctype html><html><body style="margin:40px"><h1>Checkout</h1>' + notice +
    '<form class="checkout_coupon" method="get" action="/checkout/">' +
    '<input type="text" name="coupon_code" class="input-text" id="coupon_code" placeholder="Coupon code"> ' +
    '<button type="submit" class="button" name="apply_coupon" value="Apply coupon">Apply coupon</button></form>' +
    '<table><tr class="order-total"><th>Total</th><td><strong><span class="woocommerce-Price-amount amount">$84.20</span></strong></td></tr></table>' +
    '</body></html>';
};

/**
 * A store that holds one code at a time: once a code is applied the promo box goes away and only a
 * "Remove" link is left, so the next code can only be tried after removing this one. With
 * `?remove=broken` the link puts the box back but the store forgets to restore the total.
 */
export const oneCodeStore = (url: string) => {
  const broken = new URL(url, "http://x").searchParams.get("remove") === "broken";
  return `<!doctype html><html><head><meta charset="utf-8"><title>Cart</title></head><body style="margin:40px">
  <h1>Your cart</h1>
  <div class="coupon-form">
    <input id="coupon" name="coupon" placeholder="Promo code">
    <button type="button" class="btn-apply">Apply</button>
    <p class="coupon-error" hidden></p>
  </div>
  <div class="applied-coupon" hidden><span class="applied-coupon__code"></span> applied. <a href="#" class="applied-coupon__remove">Remove</a></div>
  <p>Order total: <span class="grand-total">$50.00</span></p>
  <script>
    const form = document.querySelector(".coupon-form"), applied = document.querySelector(".applied-coupon");
    const input = document.getElementById("coupon"), error = document.querySelector(".coupon-error");
    const total = document.querySelector(".grand-total");
    document.querySelector(".btn-apply").addEventListener("click", () => setTimeout(() => {
      if (input.value.trim().toUpperCase() === "HALF") {
        error.hidden = true;
        applied.querySelector(".applied-coupon__code").textContent = input.value.trim().toUpperCase();
        input.value = "";
        form.hidden = true;
        applied.hidden = false;
        total.textContent = "$25.00";
        return;
      }
      error.textContent = "Sorry, that promo code isn't valid.";
      error.hidden = false;
    }, 400));
    document.querySelector(".applied-coupon__remove").addEventListener("click", (e) => {
      e.preventDefault();
      setTimeout(() => {
        applied.hidden = true;
        form.hidden = false;
        if (!${broken}) total.textContent = "$50.00";
      }, 300);
    });
    ${RECORD_EVENTS}
  </script>
</body></html>`;
};

/**
 * A Shopify checkout as the platform builds it: Shopify's own field names and markers, so the
 * Shopify template recognises it. Answers in place; SAVE10 takes $10 off.
 */
export const shopifyTemplateStore = () => `<!doctype html><html><head><meta charset="utf-8"><title>Checkout</title>
  <link rel="preconnect" href="https://cdn.shopify.com"></head><body style="margin:40px">
  <h1>Checkout</h1>
  <form id="discount" onsubmit="event.preventDefault()">
    <input id="ReductionsInput0" name="reductions" placeholder="Discount code or gift card" aria-describedby="">
    <button type="submit" class="_1m2hr9ge">Apply</button>
  </form>
  <p>Total <span class="payment-due__price" data-checkout-payment-due-target="8420">$84.20</span></p>
  <script>
    const input = document.getElementById("ReductionsInput0");
    document.getElementById("discount").addEventListener("submit", () => setTimeout(() => {
      document.getElementById("error-for-reductions")?.remove();
      if (input.value === "SAVE10") {
        input.value = "";
        document.querySelector(".payment-due__price").textContent = "$74.20";
        return;
      }
      const p = document.createElement("p");
      p.id = "error-for-reductions";
      p.textContent = "Enter a valid discount code or gift card";
      document.getElementById("discount").append(p);
    }, 400));
  </script>
</body></html>`;

/** WooCommerce's classic checkout: the coupon box hides behind the platform's own link and a
 *  code is answered in place, as WooCommerce's checkout script does. */
export const wooTemplateStore = () => `<!doctype html><html><head><meta charset="utf-8"><title>Checkout</title>
  <link rel="stylesheet" href="/wp-content/plugins/woocommerce/assets/css/woocommerce.css"></head>
  <body class="woocommerce-checkout woocommerce-page" style="margin:40px">
  <div class="woocommerce-notices-wrapper"></div>
  <div class="woocommerce-form-coupon-toggle"><div class="woocommerce-info">Have a coupon? <a href="#" class="showcoupon">Click here to enter your code</a></div></div>
  <form class="checkout_coupon woocommerce-form-coupon" style="display:none" onsubmit="event.preventDefault()">
    <input type="text" name="coupon_code" class="input-text" id="coupon_code" placeholder="Coupon code">
    <button type="submit" class="button" name="apply_coupon" value="Apply coupon">Apply coupon</button>
  </form>
  <table><tr class="order-total"><th>Total</th><td><strong><span class="woocommerce-Price-amount amount">$84.20</span></strong></td></tr></table>
  <script>
    document.querySelector(".showcoupon").addEventListener("click", (e) => { e.preventDefault(); document.querySelector(".checkout_coupon").style.display = ""; });
    document.querySelector(".checkout_coupon").addEventListener("submit", () => setTimeout(() => {
      const code = document.getElementById("coupon_code").value;
      document.querySelector(".woocommerce-notices-wrapper").innerHTML =
        '<ul class="woocommerce-error" role="alert"><li>Coupon "' + code.replace(/[<&"]/g, "") + '" does not exist!</li></ul>';
    }, 400));
  </script>
</body></html>`;
