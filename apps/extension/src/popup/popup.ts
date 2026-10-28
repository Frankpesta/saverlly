import type { ActivePromotion } from "@saverlly/shared-types";
import { getReviewerApiBaseUrl } from "../lib/config";
import { couponsInTestOrder } from "../lib/cart-total";
import { formatCurrency, summarizeBestDiscount } from "../lib/format";
import type {
  CouponApplyProgressMessage,
  CouponApplyResultMessage,
  ExtensionMessage,
  TabCheckoutState,
} from "../lib/messages";

// The popup is the Figma frame scaled down (popup.css). Pick the scale from the screen:
// - Large screens: as large as Chrome allows. Chrome caps a toolbar popup at 600 CSS px tall
//   however big the monitor, and the tallest state (coupon list, ~841 Figma px) still fits
//   below that at 0.705, i.e. 423px wide.
// - Short laptop screens: shrink so that state stays within ~78% of the screen, down to 0.62
//   (372px), below which the frame's 16px body text would get too small to read.
// Set before the first render, so the popup never visibly resizes after opening.
const TALLEST_STATE_FIGMA_PX = 841;
const MAX_SCALE = 0.705;
const MIN_SCALE = 0.62;
const popupScale = Math.min(
  MAX_SCALE,
  Math.max(MIN_SCALE, (window.screen.availHeight * 0.78) / TALLEST_STATE_FIGMA_PX),
);
document.documentElement.style.setProperty(
  "--popup-scale",
  popupScale.toFixed(3),
);

const content = document.getElementById("content") as HTMLElement;
const lifetimeValueEl = document.getElementById(
  "lifetime-value",
) as HTMLElement;
const promoEl = document.getElementById("promo") as HTMLElement;
const lifetimeEl = document.querySelector<HTMLElement>(".popup__lifetime");
// Every icon is an original layer cut from the Figma exports (scripts/extract-design-*).
const asset = (name: string, className = "") =>
  `<img${className ? ` class="${className}"` : ""} src="assets/${name}.svg" alt="" />`;
const TAG = asset("design-tag");
const HERO = asset("design-hero", "popup__hero");
const PAUSED_HERO = asset("design-paused-hero", "popup__hero");
// Only the green arc turns; the disc, ticks and ring beneath it stay still.
const SPINNER = `<span class="popup__progress-icon popup__spinner">${asset("design-testing")}${asset("design-testing-arc", "popup__spinner-arc")}</span>`;
// The spinner arc turns once per period and a pill icon twice (popup.css), so one clock keeps
// both in step.
const SPIN_PERIOD_MS = 1800;

type View =
  | "loading"
  | "inactive"
  | "no-offer"
  | "idle"
  | "suppressed"
  | "applying"
  | "success"
  | "failure"
  | "coupon-list";
type PillStatus = "pending" | "testing" | "applying" | "failed" | "applied";

let tabState: TabCheckoutState | null = null;
let progress: CouponApplyProgressMessage | null = null;
let lastResult: CouponApplyResultMessage | null = null;
let previousView: View = "idle";
let activeTabId: number | undefined;
let liveUpdateReceived = false;
let applyError = false;
let applyRequested = false;
let deviceDormant = false;
let reviewerFormOpen = false;
let applyStalled = false;
let applyWatchdog: ReturnType<typeof setTimeout> | undefined;
// Every live progress update re-renders "applying" and so re-arms this. One code can take up
// to 60s when a store is slow to answer, so only a silence well past that counts as stalled.
const APPLY_STALL_MS = 90_000;

function escapeHtml(value: string): string {
  const div = document.createElement("div");
  div.textContent = value;
  return div.innerHTML.replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function send(message: ExtensionMessage): Promise<unknown> {
  return chrome.runtime.sendMessage(message);
}

const DISCLOSURE_URL = "https://saverlly.com/affiliate-disclosure/";

function openDisclosurePage(): void {
  void chrome.tabs.create({ url: DISCLOSURE_URL });
}

function orderedCoupons(): TabCheckoutState["coupons"] {
  return tabState ? couponsInTestOrder(tabState.coupons) : [];
}

function buttonArrow(light = false): string {
  return asset(light ? "design-arrow-light" : "design-arrow", "popup__button-arrow");
}

function render(view: View): void {
  clearTimeout(applyWatchdog);
  if (view === "applying")
    applyWatchdog = setTimeout(() => {
      applyRequested = false;
      applyStalled = true;
      render("failure");
    }, APPLY_STALL_MS);
  content.dataset.view = view;
  // Nothing has been saved by a disconnected install, so "Lifetime Saved: —" is just noise.
  if (lifetimeEl) lifetimeEl.hidden = view === "inactive";
  switch (view) {
    case "inactive":
      if (reviewerFormOpen) return;
      content.innerHTML =
        `${HERO}<p class="popup__heading">Saverlly is not connected</p><p class="popup__subtext">Saverlly requires the Saverlly desktop app for Windows, installed on this computer by a participating business. Coupons apply only after the desktop app connects. If it is installed, keep it running and reopen Saverlly.</p>` +
        (getReviewerApiBaseUrl() ? '<button class="popup__link popup__link--strong" id="reviewer-code-link" type="button">Have a reviewer code?</button>' : '');
      document.getElementById("reviewer-code-link")?.addEventListener("click", renderReviewerForm);
      return;
    case "loading":
      content.innerHTML = `<p class="popup__subtext">Checking this page…</p>`;
      return;
    case "no-offer":
      renderNoOffer();
      return;
    case "idle":
      renderIdle();
      return;
    case "suppressed":
      renderSuppressed();
      return;
    case "applying":
      renderApplying();
      return;
    case "success":
      renderSuccess();
      return;
    case "failure":
      renderFailure();
      return;
    case "coupon-list":
      renderCouponList();
      return;
  }
}

function renderNoOffer(): void {
  content.innerHTML = `
    ${HERO}
    <p class="popup__heading">No offers here yet</p>
    <p class="popup__subtext">Saverlly didn't find a supported checkout on this page.</p>
  `;
}

function renderIdle(): void {
  if (!tabState) return renderNoOffer();
  const { bestPercent, count } = summarizeBestDiscount(tabState.coupons);
  const heading =
    bestPercent !== null
      ? `Save up to <span class="popup__accent">${bestPercent}%</span> off`
      : `Found <span class="popup__accent">${count}</span> coupon${count === 1 ? "" : "s"} to try`;

  content.innerHTML = `
    ${HERO}
    <p class="popup__heading">${heading}${tabState.coupons.some((c) => /\bfree shipping\b/i.test(c.description ?? "")) ? '<br>plus <span class="popup__accent">Free Shipping</span>' : ""}</p>
    <button class="popup__button" id="apply-btn" type="button">Apply Coupons ${buttonArrow()}</button>
    <button class="popup__link" id="no-thanks-btn" type="button">No thanks, I don’t want to save money!</button>
  `;
  document
    .getElementById("apply-btn")
    ?.addEventListener("click", onApplyClicked);
  document
    .getElementById("no-thanks-btn")
    ?.addEventListener("click", () => window.close());
}

function renderSuppressed(): void {
  content.innerHTML = `
    ${PAUSED_HERO}
    <p class="popup__heading"><span class="popup__accent">Paused</span> website</p>
    <p class="popup__subtext">Saverlly is paused because a<br>referral link is already active.</p>
    <button class="popup__button" id="apply-btn" type="button">Activate Your Savings ${buttonArrow()}</button>
    <p class="popup__terms">Save money by applying the best<br>coupons. <a href="#" id="terms-link">Terms</a> and <a href="#" id="exclusions-link">exclusions</a> apply.</p>
  `;
  document
    .getElementById("apply-btn")
    ?.addEventListener("click", onApplyClicked);
  document.getElementById("terms-link")?.addEventListener("click", (event) => {
    event.preventDefault();
    openDisclosurePage();
  });
  document
    .getElementById("exclusions-link")
    ?.addEventListener("click", (event) => {
      event.preventDefault();
      openDisclosurePage();
    });
}

function pillStatus(position: number, code: string): PillStatus {
  if (lastResult?.result === "applied" && lastResult.code === code)
    return "applied";
  if (!progress) return "pending";
  if (progress.phase === "applying" && progress.code === code)
    return "applying";
  const tested = progress.testedCodes?.find((entry) => entry.code === code);
  if (tested) return tested.saved ? "applied" : "failed";
  if (position < progress.index) return "failed";
  if (position === progress.index)
    return progress.phase === "testing" ? "testing" : "applying";
  return "pending";
}

function pillIcon(status: PillStatus): string {
  switch (status) {
    case "testing":
    case "applying":
      return asset("design-pill-testing");
    case "failed":
      return asset("design-pill-failed");
    case "applied":
      return asset("design-done");
    default:
      return "";
  }
}

function renderApplying(): void {
  const coupons = orderedCoupons();
  const total = progress?.total ?? coupons.length;
  const testingDone = progress?.phase === "applying";
  const captionText = testingDone
    ? "Applying best Code"
    : `Trying ${progress?.index ?? 0} of ${total} Codes`;

  const statuses = coupons.map((c, i) => pillStatus(i + 1, c.code));
  const pills = coupons.map(
    (c, i) =>
      `<span class="popup__pill popup__pill--${statuses[i]}" data-status="${statuses[i]}">${pillIcon(statuses[i])}${escapeHtml(c.code)}</span>`,
  );

  // Every progress message re-renders this view. Rebuilding the spinner restarted its rotation
  // (a visible jump per code), so the card is only rebuilt when its rows actually change; a new
  // code under test just refreshes the strip and caption.
  const rowsKey = `${testingDone}:${total}`;
  let card = content.querySelector<HTMLElement>(".popup__progress-card");
  if (card?.dataset.rows !== rowsKey) {
    content.innerHTML = `
      <p class="popup__heading">Applying <span class="popup__accent">deals...</span></p>
      <p class="popup__subtext">Saverlly automatically tries codes<br>to save you money.</p>
      <div class="popup__card popup__card--stacked popup__progress-card" data-rows="${rowsKey}">
        <div class="popup__progress-row">
          ${testingDone ? asset("design-done", "popup__progress-icon") : SPINNER}
          <span>Testing ${total} coupon code${total === 1 ? "" : "s"}</span>
        </div>
        <div class="popup__progress-row">
          ${testingDone ? SPINNER : asset("design-pending", "popup__progress-icon")}
          <span>Applying discounts</span>
        </div>
        <div class="popup__pill-row">${pills.join("")}</div>
      </div>
      <p class="popup__progress-caption"></p>
    `;
    card = content.querySelector<HTMLElement>(".popup__progress-card")!;
  }
  const strip = card.querySelector<HTMLElement>(".popup__pill-row")!;
  // Pills change in place, so the strip keeps its scroll position and glides to the next code.
  if (strip.children.length === pills.length)
    pills.forEach((html, i) => {
      const pill = strip.children[i] as HTMLElement;
      if (pill.dataset.status !== statuses[i]) pill.outerHTML = html;
    });
  else strip.innerHTML = pills.join("");
  content.querySelector(".popup__progress-caption")!.textContent = captionText;
  // Elements created mid-run (the spinner when testing hands over to applying, each pill's
  // icon) join the rotation at the angle it has already reached instead of starting over.
  content
    .querySelectorAll<HTMLElement>(
      ".popup__spinner-arc, .popup__pill--testing img, .popup__pill--applying img",
    )
    .forEach((spinning) => {
      // Only new elements: changing the delay of one already turning would itself jump.
      if (!spinning.style.animationDelay)
        spinning.style.animationDelay = `-${Math.round(performance.now() % SPIN_PERIOD_MS)}ms`;
    });
  const activePill = strip.querySelector<HTMLElement>(
    ".popup__pill--testing, .popup__pill--applying",
  );
  if (activePill)
    // Keep the code under test in the clear middle of the faded strip, like the frame.
    strip.scrollLeft = Math.max(0, activePill.offsetLeft - 100);
}

function renderSuccess(): void {
  if (!lastResult || lastResult.discountAmount === undefined)
    return renderFailure();
  const { discountAmount, originalTotal, newTotal, code } = lastResult;
  const total = orderedCoupons().length;
  const triedCount = lastResult.testedCount ?? progress?.index ?? total;

  content.innerHTML = `
    <p class="popup__heading">You're saving</p>
    <p class="popup__heading popup__accent">${formatCurrency(discountAmount)}!</p>
    <div class="popup__card popup__result-card">
      ${newTotal !== undefined ? `<div class="popup__savings-box">
        <div class="popup__savings-total">${formatCurrency(newTotal)}</div>
        <div class="popup__savings-label">Est. Cart Total</div>
      </div>` : ""}
      ${originalTotal !== undefined ? `<div class="popup__row popup__row--total">
        <span>Original Total</span>
        <span>${formatCurrency(originalTotal)}</span>
      </div>` : ""}
      <div class="popup__row popup__row--code">
        <span class="popup__chip">${TAG}${escapeHtml(code ?? "")}</span>
        <span class="popup__discount-value">-${formatCurrency(discountAmount)}</span>
      </div>
      <div class="popup__result-note">
        <strong>Savings applied successfully!</strong>
        <span>${lastResult.comparisonComplete === false ? "Applied a confirmed discount. Some codes could not be compared." : `We tried ${triedCount} code${triedCount === 1 ? "" : "s"} and applied the best one saving you ${formatCurrency(discountAmount)}`}</span>
      </div>
      <button class="popup__button" id="checkout-btn" type="button">Continue to Checkout ${buttonArrow()}</button>
    </div>
    <button class="popup__link" id="view-coupons-btn" type="button">View all coupons</button>
  `;
  document
    .getElementById("checkout-btn")
    ?.addEventListener("click", () => window.close());
  document.getElementById("view-coupons-btn")?.addEventListener("click", () => {
    previousView = "success";
    render("coupon-list");
  });
}

function renderFailure(): void {
  const total = orderedCoupons().length;
  const noCoupons =
    lastResult?.result === "no_coupons_available" || total === 0;
  const comparisonError = lastResult?.failureReason;
  const isError = applyError || applyStalled || !!comparisonError;
  const subtext = applyStalled
    ? "This is taking longer than expected. Check your cart, then try again."
    : comparisonError === "comparison_unavailable"
      ? "We cannot safely compare codes on this checkout yet. You can view the available coupons below."
      : comparisonError === "checkout_changed"
        ? "The checkout page changed while we were testing codes. Check your cart, then try again."
        : comparisonError
          ? "We could not confirm the best discount. Please check your cart before continuing."
          : applyError
            ? "We could not connect to this checkout. Refresh the store page and try again."
            : noCoupons
              ? "No active coupons are available for this store right now."
              : `We tried ${total} code${total === 1 ? "" : "s"} but couldn't find a discount this time.`;

  // The red alert artwork is for something going wrong. "Nothing saved this time" is a
  // normal outcome and keeps the regular hero.
  content.innerHTML = `
    ${isError ? PAUSED_HERO : HERO}
    <p class="popup__heading">${isError ? "Unable to compare coupons" : noCoupons ? "No coupons right now" : "No working codes found"}</p>
    <p class="popup__subtext">${subtext}</p>
    ${noCoupons && !isError ? "" : `<button class="popup__button" id="retry-btn" type="button">Try Coupons Again ${buttonArrow()}</button>`}
    ${total > 0 ? `<button class="popup__link" id="view-coupons-btn" type="button">View all coupons</button>` : ""}
  `;
  document
    .getElementById("retry-btn")
    ?.addEventListener("click", onApplyClicked);
  document.getElementById("view-coupons-btn")?.addEventListener("click", () => {
    previousView = "failure";
    render("coupon-list");
  });
}

function renderCouponList(): void {
  const coupons = orderedCoupons();
  const { bestPercent, count } = summarizeBestDiscount(coupons);
  const pctLabel =
    bestPercent !== null
      ? `${bestPercent}%`
      : `${count} code${count === 1 ? "" : "s"}`;

  const rows = coupons
    .map(
      (c) => `
        <div class="popup__coupon-row">
          <span class="popup__chip">${TAG}${escapeHtml(c.code)}</span>
          ${c.description ? `<div class="popup__coupon-desc">${escapeHtml(c.description)}</div>` : ""}
        </div>`,
    )
    .join("");

  content.innerHTML = `
    <button class="popup__back" id="back-btn" type="button">&larr; Back</button>
    <p class="popup__heading">Found ${count} code${count === 1 ? "" : "s"}${bestPercent !== null ? " and" : ""}</p>
    ${bestPercent !== null ? `<p class="popup__heading popup__accent">up to ${pctLabel} off</p>` : ""}
    <button class="popup__button popup__button--outline" id="retry-btn" type="button">Try Coupons Again ${buttonArrow(true)}</button>
    <div class="popup__card popup__card--stacked popup__list-card">
      <h3>${bestPercent !== null ? `Save up to <span class="popup__accent">${pctLabel}</span>` : "Available savings"}</h3>
      <p>${bestPercent !== null ? `Save up to <span class="popup__accent">${pctLabel}</span> <span class="popup__muted">on eligible items.</span>` : '<span class="popup__muted">Try these codes on eligible items.</span>'}</p>
      <strong class="popup__list-title">Available Coupons (${count})</strong>
      <div class="popup__coupon-list">${rows}</div>
    </div>
  `;
  document
    .getElementById("back-btn")
    ?.addEventListener("click", () => render(previousView));
  document
    .getElementById("retry-btn")
    ?.addEventListener("click", onApplyClicked);
}

async function onApplyClicked(): Promise<void> {
  applyRequested = true;
  progress = null;
  lastResult = null;
  applyError = false;
  applyStalled = false;
  render("applying");
  try {
    const response = (await send({ type: "APPLY_BEST_COUPON" })) as
      { started?: boolean } | undefined;
    if (!response?.started && !lastResult)
      throw new Error("Checkout unavailable");
  } catch {
    applyRequested = false;
    applyError = true;
    render("failure");
  }
}

async function refreshLifetimeSaved(): Promise<void> {
  const value = await send({ type: "GET_LIFETIME_SAVED" }).catch(() => null);
  lifetimeValueEl.textContent =
    typeof value === "number" && Number.isFinite(value)
      ? formatCurrency(value)
      : "—";
}

/**
 * Only ever http(s), a promo's clickUrl comes from the admin dashboard, but the popup opening a
 * `javascript:` or `data:` URL on the strength of a server response is not a risk worth carrying
 * for a field a human types into a form.
 */
function isSafeHttpUrl(value: string): boolean {
  try {
    const { protocol } = new URL(value);
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
}

function renderReviewerForm(): void {
  reviewerFormOpen = true;
  content.innerHTML = `
    <p class="popup__heading">Try Saverlly</p>
    <p class="popup__subtext">Enter the access code you received.</p>
    <form id="reviewer-form" class="popup__reviewer-form">
      <label for="reviewer-code">Access code</label>
      <input id="reviewer-code" class="popup__reviewer-input" type="text" required maxlength="40" autocomplete="off" spellcheck="false" placeholder="REV-…" aria-describedby="reviewer-error" />
      <p id="reviewer-error" class="popup__subtext" role="alert"></p>
      <button class="popup__button" id="reviewer-submit" type="submit">Activate Saverlly ${buttonArrow()}</button>
      <button class="popup__link" id="reviewer-back" type="button">Back</button>
    </form>`;
  const input = document.getElementById("reviewer-code") as HTMLInputElement;
  input.focus();
  document.getElementById("reviewer-back")?.addEventListener("click", () => { reviewerFormOpen = false; render("inactive"); });
  document.getElementById("reviewer-form")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const button = document.getElementById("reviewer-submit") as HTMLButtonElement;
    const error = document.getElementById("reviewer-error")!;
    button.disabled = true;
    button.textContent = "Connecting…";
    error.textContent = "";
    void send({ type: "ACTIVATE_REVIEWER", code: input.value }).then(async (result) => {
      const response = result as { activated?: boolean; error?: string } | undefined;
      if (!response?.activated) throw new Error(response?.error ?? "Could not connect. Please try again.");
      reviewerFormOpen = false;
      liveUpdateReceived = false;
      await init();
    }).catch((reason) => {
      error.textContent = reason instanceof Error ? reason.message : "Could not connect. Please try again.";
      button.disabled = false;
      button.innerHTML = `Activate Saverlly ${buttonArrow()}`;
    });
  });
}

async function renderPromo(): Promise<void> {
  const promos = (await send({ type: "GET_ACTIVE_PROMOTIONS" }).catch(
    () => [],
  )) as ActivePromotion[] | null | undefined;
  // Several promos can target one location at once; the popup has room for exactly one, and the
  // backend already returns them earliest-starting first, so the longest-running one wins.
  const promo = promos?.find(
    (p) => isSafeHttpUrl(p.clickUrl) && isSafeHttpUrl(p.imageSmallUrl),
  );
  if (!promo) {
    promoEl.hidden = true;
    return;
  }

  promoEl.innerHTML = `
    <span class="popup__promo-label">Sponsored</span>
    <a class="popup__promo-link" id="promo-link" href="${escapeHtml(promo.clickUrl)}" target="_blank" rel="noopener noreferrer">
      <img class="popup__promo-image" src="${escapeHtml(promo.imageSmallUrl)}" alt="" />
    </a>
  `;
  promoEl.hidden = false;

  document.getElementById("promo-link")?.addEventListener("click", (event) => {
    // A plain anchor inside an extension popup just closes the popup on some Chrome versions
    // without ever opening the tab. Going through chrome.tabs makes the click-through reliable.
    event.preventDefault();
    void chrome.tabs.create({ url: promo.clickUrl });
    window.close();
  });
}

chrome.runtime.onMessage.addListener((message: ExtensionMessage, sender) => {
  if (message.type === "DEVICE_STATUS_CHANGED") {
    deviceDormant = message.dormant;
    if (message.dormant) {
      applyRequested = false;
      tabState = null;
      render("inactive");
    } else {
      reviewerFormOpen = false;
      liveUpdateReceived = false;
      void init();
    }
    return;
  }
  if (message.type === "SAVINGS_UPDATED") {
    void refreshLifetimeSaved();
    return;
  }
  const sourceTabId = "tabId" in message ? message.tabId : sender.tab?.id;
  if (activeTabId === undefined || sourceTabId !== activeTabId) return;
  if (message.type === "CHECKOUT_STATE_CHANGED") {
    liveUpdateReceived = true;
    tabState = message.state;
    if (!tabState) {
      if (!applyRequested) render(deviceDormant ? "inactive" : "no-offer");
      return;
    }
    if (tabState.applyResult) {
      applyRequested = false;
      lastResult = tabState.applyResult;
      render(lastResult.result === "applied" ? "success" : "failure");
    } else if (tabState.applyProgress) {
      progress = tabState.applyProgress;
      render("applying");
    } else if (!applyRequested)
      render(tabState.suppressedStepdown ? "suppressed" : "idle");
    return;
  }
  if (message.type === "COUPON_APPLY_PROGRESS") {
    liveUpdateReceived = true;
    progress = message;
    render("applying");
    return;
  }
  if (message.type === "APPLY_DONE") {
    applyRequested = false;
    liveUpdateReceived = true;
    lastResult = message.result;
    render(message.result.result === "applied" ? "success" : "failure");
    void refreshLifetimeSaved();
  }
});

document
  .getElementById("close-btn")
  ?.addEventListener("click", () => window.close());
document
  .getElementById("disclosure-link")
  ?.addEventListener("click", (event) => {
    event.preventDefault();
    openDisclosurePage();
  });

async function init(): Promise<void> {
  void refreshLifetimeSaved();
  // Fire-and-forget alongside the view: the promo slot lives outside #content, so it is
  // independent of which view wins below and must not delay rendering that view.
  void renderPromo();
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  activeTabId = tab?.id;
  const status = (await send({ type: "GET_EXTENSION_STATUS" }).catch(
    () => null,
  )) as { dormant?: boolean } | null;
  deviceDormant = status?.dormant === true;
  if (deviceDormant) {
    render("inactive");
    return;
  }
  const state = (await send({ type: "GET_TAB_STATE" })) as
    TabCheckoutState | null | undefined;
  tabState = state ?? null;
  if (liveUpdateReceived) return;
  if (!tabState) {
    render("no-offer");
    return;
  }
  // Applying only starts on a popup click (APPLY_BEST_COUPON). If a run is already in
  // progress or finished (e.g. the popup was closed and reopened mid-run), restore that
  // state instead of showing a stale "idle" prompt; otherwise show the manual prompt.
  progress = tabState.applyProgress;
  if (tabState.applyResult) {
    lastResult = tabState.applyResult;
    render(tabState.applyResult.result === "applied" ? "success" : "failure");
    return;
  }
  if (tabState.applyProgress) {
    render("applying");
    return;
  }
  if (tabState.suppressedStepdown) {
    render("suppressed");
    return;
  }
  if (!tabState.coupons.length) return render("failure");
  render("idle");
}

void init().catch(() => {
  applyError = true;
  render("failure");
});
