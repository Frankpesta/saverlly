import { activateReviewer } from './reviewer-access';
import { getDeviceToken, getReviewerAccess, setDeviceToken } from './storage';
import { fetchDeviceStatus } from './api-client';
import { checkDeviceStatus } from './status-check';
jest.mock('./config', () => ({
  ...jest.requireActual('./config'),
  getReviewerApiBaseUrl: () => 'https://api.example.test',
}));

let local: Record<string, unknown>;
const fetchMock = jest.fn();
const code = 'REV-' + 'AAAA-'.repeat(5) + 'AAAA';
const future = () => new Date(Date.now() + 86400_000).toISOString();
beforeEach(() => {
  local = {};
  fetchMock.mockReset();
  globalThis.fetch = fetchMock;
  (globalThis as unknown as { chrome: unknown }).chrome = {
    storage: {
      local: {
        get: jest.fn(async (keys: string | string[] | null) =>
          keys === null
            ? { ...local }
            : Object.fromEntries(
                (Array.isArray(keys) ? keys : [keys]).map((key) => [
                  key,
                  local[key],
                ]),
              ),
        ),
        set: jest.fn(async (values: object) => Object.assign(local, values)),
        remove: jest.fn(async (keys: string | string[]) => {
          for (const key of Array.isArray(keys) ? keys : [keys])
            delete local[key];
        }),
      },
      session: { clear: jest.fn().mockResolvedValue(undefined) },
    },
  };
});
function redeemed() {
  return {
    ok: true,
    json: async () => ({ name: 'Reviewer', expiresAt: future() }),
  };
}

it('activates without an agent and routes the existing API client to reviewer endpoints', async () => {
  fetchMock.mockResolvedValueOnce(redeemed());
  await activateReviewer(code.toLowerCase());
  const body = JSON.parse(fetchMock.mock.calls[0][1].body);
  expect(body.code).toBe('REV' + 'A'.repeat(24));
  expect(body.token).toHaveLength(43);
  expect(await getDeviceToken()).toBe(body.token);
  expect(local.deviceToken).toBeUndefined();
  expect(local.dormant).toBe(true);
  fetchMock.mockResolvedValueOnce({
    ok: true,
    json: async () => ({ deviceActive: true, kioskStatus: 'ACTIVE' }),
  });
  await fetchDeviceStatus();
  expect(fetchMock.mock.calls[1][0]).toBe(
    'https://api.example.test/reviewer-public/devices/me/status',
  );
});

it('reuses the same activation secret after a lost response', async () => {
  fetchMock
    .mockRejectedValueOnce(new Error('connection lost'))
    .mockResolvedValueOnce(redeemed());
  await expect(activateReviewer(code)).rejects.toThrow('connection lost');
  await activateReviewer(code);
  expect(JSON.parse(fetchMock.mock.calls[0][1].body).token).toBe(
    JSON.parse(fetchMock.mock.calls[1][1].body).token,
  );
});

it('refuses to replace an agent token and gives the agent priority after reviewer activation', async () => {
  local.deviceToken = 'managed-token';
  await expect(activateReviewer(code)).rejects.toThrow('desktop agent');
  expect(fetchMock).not.toHaveBeenCalled();
  delete local.deviceToken;
  fetchMock.mockResolvedValueOnce(redeemed());
  await activateReviewer(code);
  await setDeviceToken('managed-token');
  expect(await getDeviceToken()).toBe('managed-token');
  expect(await getReviewerAccess()).toBeNull();
  expect(local.reviewerAccess).toBeUndefined();
  fetchMock.mockResolvedValueOnce({
    ok: true,
    json: async () => ({ deviceActive: true, kioskStatus: 'ACTIVE' }),
  });
  await fetchDeviceStatus();
  expect(fetchMock.mock.calls.at(-1)?.[0]).toBe(
    'http://localhost:3000/public/devices/me/status',
  );
});

it('fails closed at expiry, on revocation, and when a reviewer status check loses connectivity', async () => {
  local.reviewerAccess = {
    token: 'review-token',
    name: 'Reviewer',
    expiresAt: new Date(0).toISOString(),
  };
  await expect(fetchDeviceStatus()).rejects.toThrow('401');
  expect(fetchMock).not.toHaveBeenCalled();
  local.reviewerAccess = {
    token: 'review-token',
    name: 'Reviewer',
    expiresAt: future(),
  };
  local.lastStatusOkAt = Date.now();
  local.dormant = false;
  fetchMock.mockRejectedValueOnce(new Error('offline'));
  expect(await checkDeviceStatus()).toBe(false);
  expect(local.dormant).toBe(true);
  local.dormant = false;
  fetchMock.mockResolvedValueOnce({ status: 401, ok: false });
  expect(await checkDeviceStatus()).toBe(false);
  expect(local.dormant).toBe(true);
});

it('keeps rejected codes inactive and shows useful activation errors', async () => {
  fetchMock.mockResolvedValueOnce({
    ok: false,
    status: 400,
    json: async () => ({
      message: 'This code has reached its installation limit',
    }),
  });
  await expect(activateReviewer(code)).rejects.toThrow('installation limit');
  expect(local.reviewerAccess).toBeUndefined();
  expect(local.reviewerActivation).toBeUndefined();
});
