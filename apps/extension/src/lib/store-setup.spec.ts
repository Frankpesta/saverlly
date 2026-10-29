import {
  endStoreSetup,
  fetchStoreSetupSession,
  formatTimeLeft,
  getStoreSetup,
  redeemStoreSetupCode,
  StoreSetupEndedError,
  submitStoreSetupRecipe,
  type StoreSetupRecord,
} from './store-setup';

let local: Record<string, unknown>;
const fetchMock = jest.fn();
const CODE = 'SET-7K4Q-92MD';
const merchant = { id: 'm1', name: 'Shop', domain: 'shop.test' };
const hoursFromNow = (h: number) => new Date(Date.now() + h * 3_600_000).toISOString();

const json = (status: number, body: unknown) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
});
const redeemed = (sessionId = 's1') =>
  json(200, { sessionId, expiresAt: hoursFromNow(4), merchant });
const record = (overrides: Partial<StoreSetupRecord> = {}): StoreSetupRecord => ({
  token: 'T'.repeat(43),
  apiBaseUrl: 'https://api.saverlly.test',
  sessionId: 's1',
  expiresAt: hoursFromNow(4),
  merchant,
  ...overrides,
});
const body = (call: number) => JSON.parse(fetchMock.mock.calls[call][1].body as string);

beforeEach(() => {
  local = {};
  fetchMock.mockReset();
  globalThis.fetch = fetchMock;
  (globalThis as unknown as { chrome: unknown }).chrome = {
    storage: {
      local: {
        get: jest.fn(async (keys: string | string[]) =>
          Object.fromEntries(
            (Array.isArray(keys) ? keys : [keys])
              .filter((key) => key in local)
              .map((key) => [key, local[key]]),
          ),
        ),
        set: jest.fn(async (values: object) => Object.assign(local, values)),
        remove: jest.fn(async (keys: string | string[]) => {
          for (const key of Array.isArray(keys) ? keys : [keys]) delete local[key];
        }),
      },
    },
  };
});

describe('redeeming a code', () => {
  it('normalizes the code, pins the agent-provided backend, and leaves shopper state alone', async () => {
    local.apiBaseUrl = 'https://api.saverlly.test';
    local.deviceToken = 'device-token';
    local.dormant = false;
    local.merchantCache = { 'shop.test': {} };
    fetchMock.mockResolvedValueOnce(redeemed());

    const result = await redeemStoreSetupCode(' set 7k4q-92md ');

    expect(fetchMock.mock.calls[0][0]).toBe('https://api.saverlly.test/store-setup/redeem');
    expect(body(0).code).toBe('SET7K4Q92MD');
    expect(body(0).token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(result).toEqual({
      token: body(0).token,
      apiBaseUrl: 'https://api.saverlly.test',
      sessionId: 's1',
      expiresAt: expect.any(String),
      merchant,
    });
    expect(local.storeSetupSession).toEqual(result);
    expect(local.storeSetupActivation).toBeUndefined();
    expect(local.deviceToken).toBe('device-token');
    expect(local.dormant).toBe(false);
    expect(local.merchantCache).toEqual({ 'shop.test': {} });
  });

  it('falls back to the backend baked into the build without an agent', async () => {
    fetchMock.mockResolvedValueOnce(redeemed());
    await redeemStoreSetupCode(CODE);
    expect(fetchMock.mock.calls[0][0]).toBe('http://localhost:3000/store-setup/redeem');
  });

  it('rejects a malformed code without calling the backend', async () => {
    await expect(redeemStoreSetupCode('SET-12')).rejects.toThrow(
      'Enter the full setup code shown on the dashboard.',
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('retries a lost response with the same secret, but uses a new secret for a new code', async () => {
    fetchMock
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(json(401, { message: 'This setup code is invalid or has expired' }))
      .mockResolvedValueOnce(redeemed());
    await expect(redeemStoreSetupCode(CODE)).rejects.toThrow('Failed to fetch');
    await expect(redeemStoreSetupCode(CODE)).rejects.toThrow(
      'This setup code is invalid or has expired',
    );
    await redeemStoreSetupCode('SET-2222-3333');
    expect(body(1).token).toBe(body(0).token);
    expect(body(2).token).not.toBe(body(0).token);
  });

  it('keeps the secret for a retry after a rate limit, and drops it after a definite rejection', async () => {
    fetchMock.mockResolvedValueOnce(json(429, {}));
    await expect(redeemStoreSetupCode(CODE)).rejects.toThrow(
      'Too many attempts. Wait a minute and try again.',
    );
    expect(local.storeSetupActivation).toBeDefined();
    fetchMock.mockResolvedValueOnce(json(400, { message: ['code must match'] }));
    await expect(redeemStoreSetupCode(CODE)).rejects.toThrow('code must match');
    expect(local.storeSetupActivation).toBeUndefined();
    expect(local.storeSetupSession).toBeUndefined();
  });

  it('shares one request between concurrent submissions', async () => {
    fetchMock.mockResolvedValueOnce(redeemed());
    const [a, b] = await Promise.all([redeemStoreSetupCode(CODE), redeemStoreSetupCode(CODE)]);
    expect(a).toBe(b);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('sends a different code entered meanwhile on its own, after the first', async () => {
    fetchMock
      .mockResolvedValueOnce(json(401, { message: 'This setup code is invalid or has expired' }))
      .mockResolvedValueOnce(redeemed('s2'));
    const [typo, right] = await Promise.allSettled([
      redeemStoreSetupCode('SET-AAAA-AAAA'),
      redeemStoreSetupCode(CODE),
    ]);
    expect(typo.status).toBe('rejected');
    expect(right).toEqual({ status: 'fulfilled', value: expect.objectContaining({ sessionId: 's2' }) });
    expect(body(0).code).toBe('SETAAAAAAAA');
    expect(body(1).code).toBe('SET7K4Q92MD');
  });

  it('ends the previous session on the backend when a new one replaces it', async () => {
    local.storeSetupSession = record({ sessionId: 'old', token: 'O'.repeat(43) });
    fetchMock.mockResolvedValueOnce(redeemed('new')).mockResolvedValueOnce(json(204, null));
    await redeemStoreSetupCode(CODE);
    expect((local.storeSetupSession as StoreSetupRecord).sessionId).toBe('new');
    expect(fetchMock.mock.calls[1][0]).toBe('https://api.saverlly.test/store-setup/session/end');
    expect(fetchMock.mock.calls[1][1].headers).toEqual({ Authorization: `Bearer ${'O'.repeat(43)}` });
  });
});

describe('an active session', () => {
  it('is cleared on read once expired or malformed', async () => {
    local.storeSetupSession = record({ expiresAt: new Date(Date.now() - 1000).toISOString() });
    expect(await getStoreSetup()).toBeNull();
    expect(local.storeSetupSession).toBeUndefined();
    local.storeSetupSession = { token: 'x' };
    expect(await getStoreSetup()).toBeNull();
    expect(local.storeSetupSession).toBeUndefined();
  });

  it('calls the backend it was issued by, even if the agent backend changes later', async () => {
    local.storeSetupSession = record();
    local.apiBaseUrl = 'https://other.saverlly.test';
    fetchMock.mockResolvedValueOnce(json(200, { sessionId: 's1' }));
    await fetchStoreSetupSession();
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.saverlly.test/store-setup/session');
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe(`Bearer ${'T'.repeat(43)}`);
  });

  it('ends locally when the backend rejects the token', async () => {
    local.storeSetupSession = record();
    fetchMock.mockResolvedValueOnce(json(401, {}));
    await expect(fetchStoreSetupSession()).rejects.toBeInstanceOf(StoreSetupEndedError);
    expect(local.storeSetupSession).toBeUndefined();
  });

  it('survives a server error, which is not proof the session ended', async () => {
    local.storeSetupSession = record();
    fetchMock.mockResolvedValueOnce(json(503, {}));
    await expect(fetchStoreSetupSession()).rejects.toThrow('Unexpected status 503');
    expect(local.storeSetupSession).toBeDefined();
  });

  it('does not clear a newer session when an older request is rejected', async () => {
    local.storeSetupSession = record();
    fetchMock.mockImplementationOnce(async () => {
      local.storeSetupSession = record({ sessionId: 's2' });
      return json(401, {});
    });
    await expect(fetchStoreSetupSession()).rejects.toBeInstanceOf(StoreSetupEndedError);
    expect((local.storeSetupSession as StoreSetupRecord).sessionId).toBe('s2');
  });

  it('submits a draft and surfaces the validation message on rejection', async () => {
    local.storeSetupSession = record();
    const payload = {
      recipe: {
        couponFieldSelector: 'input',
        applyButtonSelector: 'button',
        successIndicatorSelector: '.ok',
        failureIndicatorSelector: '.error',
        cartTotalSelector: '.total',
        checkoutUrlPatterns: ['/checkout'],
      },
      testResult: { passed: true, checks: [{ key: 'promoField' as const, outcome: 'pass' as const }], testedAt: new Date().toISOString() },
    };
    fetchMock.mockResolvedValueOnce(json(200, { state: 'SUBMITTED' }));
    await submitStoreSetupRecipe(payload);
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.saverlly.test/store-setup/session/recipe');
    expect(fetchMock.mock.calls[0][1].method).toBe('POST');
    expect(body(0)).toEqual(payload);
    fetchMock.mockResolvedValueOnce(json(400, { message: ['couponFieldSelector must be a valid CSS selector'] }));
    await expect(submitStoreSetupRecipe(payload)).rejects.toThrow(
      'couponFieldSelector must be a valid CSS selector',
    );
  });

  it('ends locally even when the backend is unreachable', async () => {
    local.storeSetupSession = record();
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    await endStoreSetup();
    expect(local.storeSetupSession).toBeUndefined();
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.saverlly.test/store-setup/session/end');
  });
});

it('formats the time left for people', () => {
  const now = Date.parse('2026-10-29T12:00:00Z');
  const at = (minutes: number) => new Date(now + minutes * 60_000).toISOString();
  expect(formatTimeLeft(at(232), now)).toBe('3h 52m');
  expect(formatTimeLeft(at(60), now)).toBe('1h 0m');
  expect(formatTimeLeft(at(12.5), now)).toBe('12m');
  expect(formatTimeLeft(at(0.5), now)).toBe('under a minute');
  expect(formatTimeLeft(at(-5), now)).toBe('under a minute');
});
