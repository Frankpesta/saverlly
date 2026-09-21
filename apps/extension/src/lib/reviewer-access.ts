import { getReviewerApiBaseUrl } from './config';
import { clearMerchantCache, setDormant, type ReviewerAccess } from './storage';

let activating: Promise<void> | undefined;
export function activateReviewer(code: string): Promise<void> {
  if (activating) return activating;
  activating = redeem(code).finally(() => {
    activating = undefined;
  });
  return activating;
}

async function redeem(value: string): Promise<void> {
  const code = value.replace(/[-\s]/g, '').toUpperCase();
  if (!/^REV[0-9A-F]{24}$/.test(code))
    throw new Error('Enter the full access code you received.');
  const baseUrl = getReviewerApiBaseUrl();
  if (!baseUrl)
    throw new Error(
      'Reviewer access is not available in this version of Saverlly.',
    );
  const stored = await chrome.storage.local.get([
    'deviceToken',
    'reviewerActivation',
  ]);
  if (stored.deviceToken)
    throw new Error(
      'This installation is connected through the desktop agent.',
    );
  // Keep the same secret across response loss/restarts; it is never placed in a URL.
  let token = (stored.reviewerActivation as { token?: string } | undefined)
    ?.token;
  if (!token) {
    token = btoa(
      String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))),
    )
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
    await chrome.storage.local.set({ reviewerActivation: { token } });
  }
  const response = await fetch(baseUrl + '/reviewer-access/redeem', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, token }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) {
    if (response.status < 500 && response.status !== 429)
      await chrome.storage.local.remove('reviewerActivation');
    const body = await response.json().catch(() => ({}));
    throw new Error(
      response.status === 429
        ? 'Too many attempts. Wait a minute and try again.'
        : typeof body.message === 'string'
          ? body.message
          : 'Could not activate this code. Please try again.',
    );
  }
  const result = (await response.json()) as { name: string; expiresAt: string };
  if (
    !Number.isFinite(Date.parse(result.expiresAt)) ||
    Date.parse(result.expiresAt) <= Date.now()
  )
    throw new Error('This access code has expired.');
  if ((await chrome.storage.local.get('deviceToken')).deviceToken)
    throw new Error(
      'The desktop agent connected. Reviewer access is not needed.',
    );
  const access: ReviewerAccess = {
    token,
    name: result.name,
    expiresAt: result.expiresAt,
  };
  await clearMerchantCache();
  await chrome.storage.session.clear();
  await chrome.storage.local.set({ reviewerAccess: access });
  await chrome.storage.local.remove([
    'reviewerActivation',
    'lastStatusOkAt',
    'attributionLog',
  ]);
  await setDormant(true); // Only a successful authenticated status check unlocks checkout.
}
