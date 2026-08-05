import { sortCouponsBySuccessLikelihood } from '../lib/cart-total';
import { formatCurrency, summarizeBestDiscount } from '../lib/format';
import { ARROW_ICON, CHECK_ICON, SIREN_ICON, SPINNER_ICON, TAG_ICON, X_ICON } from './icons';
import type {
  CouponApplyProgressMessage,
  CouponApplyResultMessage,
  ExtensionMessage,
  TabCheckoutState,
} from '../lib/messages';

const content = document.getElementById('content') as HTMLElement;
const lifetimeValueEl = document.getElementById('lifetime-value') as HTMLElement;

type View = 'loading' | 'no-offer' | 'idle' | 'suppressed' | 'applying' | 'success' | 'failure' | 'coupon-list';
type PillStatus = 'pending' | 'testing' | 'applying' | 'failed' | 'applied';

let tabState: TabCheckoutState | null = null;
let progress: CouponApplyProgressMessage | null = null;
let lastResult: CouponApplyResultMessage | null = null;
let previousView: View = 'idle';

function escapeHtml(value: string): string {
  const div = document.createElement('div');
  div.textContent = value;
  return div.innerHTML;
}

function send(message: ExtensionMessage): Promise<unknown> {
  return chrome.runtime.sendMessage(message);
}

function orderedCoupons(): TabCheckoutState['coupons'] {
  return tabState ? sortCouponsBySuccessLikelihood(tabState.coupons) : [];
}

function buttonArrow(): string {
  return `<span class="popup__button-arrow">${ARROW_ICON}</span>`;
}

function render(view: View): void {
  switch (view) {
    case 'loading':
      content.innerHTML = `<p class="popup__subtext">Checking this page…</p>`;
      return;
    case 'no-offer':
      renderNoOffer();
      return;
    case 'idle':
      renderIdle();
      return;
    case 'suppressed':
      renderSuppressed();
      return;
    case 'applying':
      renderApplying();
      return;
    case 'success':
      renderSuccess();
      return;
    case 'failure':
      renderFailure();
      return;
    case 'coupon-list':
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
      : `Found <span class="popup__accent">${count}</span> coupon${count === 1 ? '' : 's'} to try`;

  content.innerHTML = `
    <div class="popup__hero"><img src="assets/hero.png" alt="" /></div>
    <p class="popup__heading popup__heading--lg">${heading}</p>
    <button class="popup__button" id="apply-btn" type="button">Apply Coupons ${buttonArrow()}</button>
    <button class="popup__link popup__link--muted" id="no-thanks-btn" type="button">
      No thanks, I don't want to save money!
    </button>
  `;
  document.getElementById('apply-btn')?.addEventListener('click', onApplyClicked);
  document.getElementById('no-thanks-btn')?.addEventListener('click', () => window.close());
}

function renderSuppressed(): void {
  content.innerHTML = `
    <div class="popup__alert-icon">${SIREN_ICON}</div>
    <p class="popup__heading"><span class="popup__accent">Paused</span> website</p>
    <p class="popup__subtext">Saverlly is paused because a referral link is already active.</p>
    <button class="popup__button" id="apply-btn" type="button">Activate Your Savings ${buttonArrow()}</button>
    <p class="popup__subtext" style="margin-top: 14px; margin-bottom: 0;">
      Save money by applying the best coupons. <u>Terms</u> and <u>exclusions</u> apply.
    </p>
  `;
  document.getElementById('apply-btn')?.addEventListener('click', onApplyClicked);
}

function pillStatus(position: number, code: string): PillStatus {
  if (lastResult?.result === 'applied' && lastResult.code === code) return 'applied';
  if (!progress) return 'pending';
  if (position < progress.index) return 'failed';
  if (position === progress.index) return progress.phase === 'testing' ? 'testing' : 'applying';
  return 'pending';
}

function pillIcon(status: PillStatus): string {
  switch (status) {
    case 'testing':
    case 'applying':
      return SPINNER_ICON;
    case 'failed':
      return X_ICON;
    case 'applied':
      return CHECK_ICON;
    default:
      return '';
  }
}

function renderApplying(): void {
  const coupons = orderedCoupons();
  const total = progress?.total ?? coupons.length;
  const testingDone = progress?.phase === 'applying';
  const captionText = testingDone ? 'Applying best Code' : `Trying ${progress?.index ?? 0} of ${total} Codes`;

  const pills = coupons
    .slice(0, 6)
    .map((c, i) => {
      const status = pillStatus(i + 1, c.code);
      return `<span class="popup__pill popup__pill--${status}">${pillIcon(status)}${escapeHtml(c.code)}</span>`;
    })
    .join('');

  content.innerHTML = `
    <p class="popup__heading">Applying <span class="popup__accent">deals…</span></p>
    <p class="popup__subtext">Saverlly automatically tries codes to save you money.</p>
    <div class="popup__progress-card">
      <div class="popup__progress-row">
        <span class="popup__progress-icon ${testingDone ? 'popup__progress-icon--done' : 'popup__progress-icon--active'}">${testingDone ? CHECK_ICON : SPINNER_ICON}</span>
        <span>Testing ${total} coupon code${total === 1 ? '' : 's'}</span>
      </div>
      <div class="popup__progress-row">
        <span class="popup__progress-icon ${testingDone ? 'popup__progress-icon--active' : ''}">${testingDone ? SPINNER_ICON : ''}</span>
        <span>Applying discounts</span>
      </div>
      <div class="popup__pill-row">${pills}</div>
    </div>
    <p class="popup__progress-caption">${captionText}</p>
  `;
}

function renderSuccess(): void {
  if (!lastResult || lastResult.discountAmount === undefined) return renderFailure();
  const { discountAmount, originalTotal, newTotal, code } = lastResult;
  const total = orderedCoupons().length;

  content.innerHTML = `
    <p class="popup__heading">You're saving</p>
    <p class="popup__heading popup__heading--lg popup__accent">${formatCurrency(discountAmount)}!</p>
    <div class="popup__savings-box">
      <div class="popup__savings-total">${newTotal !== undefined ? formatCurrency(newTotal) : '—'}</div>
      <div class="popup__savings-label">Est. Cart Total</div>
    </div>
    <div class="popup__row">
      <span>Original Total</span>
      <span>${originalTotal !== undefined ? formatCurrency(originalTotal) : '—'}</span>
    </div>
    <div class="popup__row">
      <span class="popup__chip">${TAG_ICON}${escapeHtml(code ?? '')}</span>
      <span class="popup__discount-value">-${formatCurrency(discountAmount)}</span>
    </div>
    <div class="popup__result-note">
      <strong>Savings applied successfully!</strong>
      <span>We tried ${total} code${total === 1 ? '' : 's'} and applied the best one saving you ${formatCurrency(discountAmount)}</span>
    </div>
    <button class="popup__button" id="checkout-btn" type="button">Continue to Checkout ${buttonArrow()}</button>
    <button class="popup__link" id="view-coupons-btn" type="button">View all coupons</button>
  `;
  document.getElementById('checkout-btn')?.addEventListener('click', () => window.close());
  document.getElementById('view-coupons-btn')?.addEventListener('click', () => {
    previousView = 'success';
    render('coupon-list');
  });
}

function renderFailure(): void {
  const total = orderedCoupons().length;
  const noCoupons = lastResult?.result === 'no_coupons_available' || total === 0;
  const subtext = noCoupons
    ? 'No active coupons are available for this store right now.'
    : `We tried ${total} code${total === 1 ? '' : 's'} but couldn't find a discount this time.`;

  content.innerHTML = `
    <p class="popup__heading">No working codes found</p>
    <p class="popup__subtext">${subtext}</p>
    <button class="popup__button" id="retry-btn" type="button">Try Coupons Again ${buttonArrow()}</button>
    ${total > 0 ? `<button class="popup__link" id="view-coupons-btn" type="button">View all coupons</button>` : ''}
  `;
  document.getElementById('retry-btn')?.addEventListener('click', onApplyClicked);
  document.getElementById('view-coupons-btn')?.addEventListener('click', () => {
    previousView = 'failure';
    render('coupon-list');
  });
}

function renderCouponList(): void {
  const coupons = orderedCoupons();
  const { bestPercent, count } = summarizeBestDiscount(coupons);
  const pctLabel = bestPercent !== null ? `${bestPercent}%` : `${count} code${count === 1 ? '' : 's'}`;

  const rows = coupons
    .map(
      (c) => `
        <div class="popup__coupon-row">
          <span class="popup__chip">${TAG_ICON}${escapeHtml(c.code)}</span>
          ${c.description ? `<div class="popup__coupon-desc">${escapeHtml(c.description)}</div>` : ''}
        </div>`,
    )
    .join('');

  content.innerHTML = `
    <button class="popup__back" id="back-btn" type="button">&larr; Back</button>
    <p class="popup__heading">Found ${count} code${count === 1 ? '' : 's'} and</p>
    <p class="popup__heading popup__heading--lg popup__accent">up to ${pctLabel} off</p>
    <button class="popup__button popup__button--outline" id="retry-btn" type="button">Try Coupons Again ${buttonArrow()}</button>
    <div class="popup__list-card">
      <h3>Save up to <span class="popup__accent">${pctLabel}</span></h3>
      <p>Save up to ${pctLabel} on eligible items.</p>
      <strong style="font-size: 13px;">Available Coupons (${count})</strong>
      ${rows}
    </div>
  `;
  document.getElementById('back-btn')?.addEventListener('click', () => render(previousView));
  document.getElementById('retry-btn')?.addEventListener('click', onApplyClicked);
}

function onApplyClicked(): void {
  progress = null;
  lastResult = null;
  render('applying');
  void send({ type: 'APPLY_BEST_COUPON' });
}

async function refreshLifetimeSaved(): Promise<void> {
  const value = (await send({ type: 'GET_LIFETIME_SAVED' })) as number | null;
  lifetimeValueEl.textContent = value === null ? '—' : formatCurrency(value);
}

chrome.runtime.onMessage.addListener((message: ExtensionMessage) => {
  if (message.type === 'COUPON_APPLY_PROGRESS') {
    progress = message;
    render('applying');
    return;
  }
  if (message.type === 'APPLY_DONE') {
    lastResult = message.result;
    render(message.result.result === 'applied' ? 'success' : 'failure');
    void refreshLifetimeSaved();
  }
});

document.getElementById('close-btn')?.addEventListener('click', () => window.close());

async function init(): Promise<void> {
  void refreshLifetimeSaved();
  const state = (await send({ type: 'GET_TAB_STATE' })) as TabCheckoutState | null | undefined;
  tabState = state ?? null;
  if (!tabState) {
    render('no-offer');
  } else {
    render(tabState.suppressedStepdown ? 'suppressed' : 'idle');
  }
}

void init();
