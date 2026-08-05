import type { ApplyDoneMessage, ExtensionMessage, TabCheckoutState } from '../lib/messages';

const content = document.getElementById('content') as HTMLElement;

function render(html: string): void {
  content.innerHTML = html;
}

function renderNoOffer(): void {
  render(`<p class="popup__status">No coupon offers detected on this page.</p>`);
}

function renderState(state: TabCheckoutState): void {
  const couponCount = state.coupons.length;
  const note = state.suppressedStepdown
    ? `<p class="popup__note">Another affiliate link was already active for this store — apply manually if you'd still like to try Saverlly's best coupon.</p>`
    : '';
  const buttonLabel = couponCount > 0 ? 'Apply best coupon' : 'No coupons available';

  render(`
    <p class="popup__merchant">${escapeHtml(state.merchantName)}</p>
    <p class="popup__coupon-count">${couponCount} coupon${couponCount === 1 ? '' : 's'} available</p>
    ${note}
    <button class="popup__button" id="apply-btn" ${couponCount === 0 ? 'disabled' : ''}>${buttonLabel}</button>
    <div id="result"></div>
  `);

  document.getElementById('apply-btn')?.addEventListener('click', onApplyClicked);
}

function escapeHtml(value: string): string {
  const div = document.createElement('div');
  div.textContent = value;
  return div.innerHTML;
}

function onApplyClicked(): void {
  const button = document.getElementById('apply-btn') as HTMLButtonElement | null;
  if (button) {
    button.disabled = true;
    button.textContent = 'Applying…';
  }
  const message: ExtensionMessage = { type: 'APPLY_BEST_COUPON' };
  chrome.runtime.sendMessage(message);
}

function renderResult(result: ApplyDoneMessage['result']): void {
  const resultEl = document.getElementById('result');
  if (!resultEl) return;
  if (result === 'applied') {
    resultEl.innerHTML = `<p class="popup__result popup__result--success">Coupon applied!</p>`;
  } else {
    resultEl.innerHTML = `<p class="popup__result popup__result--failure">No working coupon found this time.</p>`;
  }
  const button = document.getElementById('apply-btn') as HTMLButtonElement | null;
  if (button) button.disabled = false;
}

chrome.runtime.onMessage.addListener((message: ExtensionMessage) => {
  if (message.type === 'APPLY_DONE') {
    renderResult(message.result);
  }
});

async function init(): Promise<void> {
  const message: ExtensionMessage = { type: 'GET_TAB_STATE' };
  const state = (await chrome.runtime.sendMessage(message)) as TabCheckoutState | null | undefined;
  if (state) {
    renderState(state);
  } else {
    renderNoOffer();
  }
}

void init();
