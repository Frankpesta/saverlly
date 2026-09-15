import type { ActivePromotion } from "@saverlly/shared-types";
import { sortCouponsBySuccessLikelihood } from "../lib/cart-total";
import { formatCurrency, summarizeBestDiscount } from "../lib/format";
import {
  ARROW_ICON,
  CHECK_ICON,
  SPINNER_ICON,
  TAG_ICON,
  X_ICON,
} from "./icons";
import type {
  CouponApplyProgressMessage,
  CouponApplyResultMessage,
  ExtensionMessage,
  TabCheckoutState,
} from "../lib/messages";

const content = document.getElementById("content") as HTMLElement;
const lifetimeValueEl = document.getElementById(
  "lifetime-value",
) as HTMLElement;
const promoEl = document.getElementById("promo") as HTMLElement;
const testingIcon = '<img src="assets/design-testing.svg" alt="" />';
const pendingIcon = '<img src="assets/design-pending.svg" alt="" />';

type View =
  | "loading"
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
  return tabState ? sortCouponsBySuccessLikelihood(tabState.coupons) : [];
}

function buttonArrow(): string {
  return `<span class="popup__button-arrow">${ARROW_ICON}</span>`;
}

function render(view: View): void {
  content.dataset.view = view;
  switch (view) {
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
    <div class="popup__hero">
      <img class="popup__hero-illustration" src="assets/design-hero.svg" alt="" />
    </div>
    <p class="popup__heading popup__heading--lg">${heading}${tabState.coupons.some((c) => /\bfree shipping\b/i.test(c.description ?? "")) ? '<br>plus <span class="popup__accent">Free Shipping</span>' : ""}</p>
    <button class="popup__button" id="apply-btn" type="button">Apply Coupons ${buttonArrow()}</button>
    <button class="popup__link popup__link--strong" id="no-thanks-btn" type="button">
      No thanks, I don't want to save money!
    </button>
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
    <div class="popup__hero">
      <img class="popup__hero-illustration" src="assets/paused.svg" alt="" />
      <img class="popup__hero-icon" src="assets/paused-inside.svg" alt="" />
    </div>
    <p class="popup__heading"><span class="popup__accent">Paused</span> website</p>
    <p class="popup__subtext popup__subtext--dark">Saverlly is paused because a referral link is already active.</p>
    <button class="popup__button" id="apply-btn" type="button">Activate Your Savings ${buttonArrow()}</button>
    <p class="popup__subtext popup__subtext--dark" style="margin-top: 14px; margin-bottom: 0;">
      Save money by applying the best coupons. <a href="#" id="terms-link"><strong><u>Terms</u></strong></a> and <a href="#" id="exclusions-link"><strong><u>exclusions</u></strong></a> apply.
    </p>
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
      return SPINNER_ICON;
    case "failed":
      return X_ICON;
    case "applied":
      return CHECK_ICON;
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

  const pills = coupons
    .map((c, i) => {
      const status = pillStatus(i + 1, c.code);
      return `<span class="popup__pill popup__pill--${status}">${pillIcon(status)}${escapeHtml(c.code)}</span>`;
    })
    .join("");

  content.innerHTML = `
    <p class="popup__heading">Applying <span class="popup__accent">deals...</span></p>
    <p class="popup__subtext">Saverlly automatically tries codes to save you money.</p>
    <div class="popup__progress-card">
      <div class="popup__progress-row">
        <span class="popup__progress-icon ${testingDone ? "popup__progress-icon--done" : "popup__progress-icon--active"}">${testingDone ? CHECK_ICON : testingIcon}</span>
        <span>Testing ${total} coupon code${total === 1 ? "" : "s"}</span>
      </div>
      <div class="popup__progress-row">
        <span class="popup__progress-icon ${testingDone ? "popup__progress-icon--active" : "popup__progress-icon--pending"}">${testingDone ? testingIcon : pendingIcon}</span>
        <span>Applying discounts</span>
      </div>
      <div class="popup__pill-row">${pills}</div>
    </div>
    <p class="popup__progress-caption">${captionText}</p>
  `;
  const activePill = content.querySelector<HTMLElement>(
    ".popup__pill--testing, .popup__pill--applying",
  );
  if (activePill)
    activePill.parentElement!.scrollLeft = Math.max(
      0,
      activePill.offsetLeft - 60,
    );
}

function renderSuccess(): void {
  if (!lastResult || lastResult.discountAmount === undefined)
    return renderFailure();
  const { discountAmount, originalTotal, newTotal, code } = lastResult;
  const total = orderedCoupons().length;
  const triedCount = lastResult.testedCount ?? progress?.index ?? total;

  content.innerHTML = `
    <p class="popup__heading">You're saving</p>
    <p class="popup__heading popup__heading--lg popup__accent">${formatCurrency(discountAmount)}!</p>
    <div class="popup__result-card">
    <div class="popup__savings-box">
      <div class="popup__savings-total">${newTotal !== undefined ? formatCurrency(newTotal) : " "}</div>
      <div class="popup__savings-label">Est. Cart Total</div>
    </div>
    <div class="popup__row">
      <span>Original Total</span>
      <span>${originalTotal !== undefined ? formatCurrency(originalTotal) : " "}</span>
    </div>
    <div class="popup__row">
      <span class="popup__chip">${TAG_ICON}${escapeHtml(code ?? "")}</span>
      <span class="popup__discount-value">-${formatCurrency(discountAmount)}</span>
    </div>
    <div class="popup__result-note">
      <strong>Savings applied successfully!</strong>
      <span>We tried ${triedCount} code${triedCount === 1 ? "" : "s"} and applied the best one saving you ${formatCurrency(discountAmount)}</span>
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
  const subtext = comparisonError === 'comparison_unavailable'
    ? 'We cannot safely compare codes on this checkout yet. You can view the available coupons below.'
    : comparisonError
    ? 'We could not confirm the best discount. Please check your cart before continuing.'
    : applyError
    ? "We could not connect to this checkout. Refresh the store page and try again."
    : noCoupons
      ? "No active coupons are available for this store right now."
      : `We tried ${total} code${total === 1 ? "" : "s"} but couldn't find a discount this time.`;

  content.innerHTML = `
    <div class="popup__hero">
      <img class="popup__hero-illustration" src="assets/paused.svg" alt="" />
      <img class="popup__hero-icon" src="assets/paused-inside.svg" alt="" />
    </div>
    <p class="popup__heading">${applyError || comparisonError ? "Unable to compare coupons" : "No working codes found"}</p>
    <p class="popup__subtext">${subtext}</p>
    <button class="popup__button" id="retry-btn" type="button">Try Coupons Again ${buttonArrow()}</button>
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
          <span class="popup__chip">${TAG_ICON}${escapeHtml(c.code)}</span>
          ${c.description ? `<div class="popup__coupon-desc">${escapeHtml(c.description)}</div>` : ""}
        </div>`,
    )
    .join("");

  content.innerHTML = `
    <button class="popup__back" id="back-btn" type="button">&larr; Back</button>
    <p class="popup__heading">Found ${count} code${count === 1 ? "" : "s"}${bestPercent !== null ? " and" : ""}</p>
    ${bestPercent !== null ? `<p class="popup__heading popup__heading--lg popup__accent">up to ${pctLabel} off</p>` : ""}
    <button class="popup__button popup__button--outline" id="retry-btn" type="button">Try Coupons Again ${buttonArrow()}</button>
    <div class="popup__list-card">
      <h3>${bestPercent !== null ? `Save up to <span class="popup__accent">${pctLabel}</span>` : "Available savings"}</h3>
      <p>${bestPercent !== null ? `Save up to <span class="popup__accent">${pctLabel}</span> on eligible items.` : "Try these codes on eligible items."}</p>
      <strong class="popup__list-title">Available Coupons (${count})</strong>
      ${rows}
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
  progress = null;
  lastResult = null;
  applyError = false;
  render("applying");
  try {
    const response = (await send({ type: "APPLY_BEST_COUPON" })) as
      { started?: boolean } | undefined;
    if (!response?.started && !lastResult)
      throw new Error("Checkout unavailable");
  } catch {
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
  const sourceTabId = "tabId" in message ? message.tabId : sender.tab?.id;
  if (activeTabId === undefined || sourceTabId !== activeTabId) return;
  if (message.type === "COUPON_APPLY_PROGRESS") {
    liveUpdateReceived = true;
    progress = message;
    render("applying");
    return;
  }
  if (message.type === "APPLY_DONE") {
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
