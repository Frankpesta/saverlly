// Jest has no build step, so the baked-in values are set as globals here.
const globals = globalThis as { __API_BASE_URL__?: string; __REVIEWER_ACCESS__?: boolean };

function loadConfig(apiBaseUrl: string | undefined, reviewerAccess: boolean | undefined) {
  globals.__API_BASE_URL__ = apiBaseUrl;
  globals.__REVIEWER_ACCESS__ = reviewerAccess;
  let config!: typeof import('./config');
  jest.isolateModules(() => {
    config = require('./config') as typeof import('./config');
  });
  return config;
}

afterEach(() => {
  delete globals.__API_BASE_URL__;
  delete globals.__REVIEWER_ACCESS__;
});

describe('baked-in backend', () => {
  it('uses the backend baked into the build', () => {
    expect(loadConfig('https://api.saverlly.test', false).DEFAULT_API_BASE_URL).toBe('https://api.saverlly.test');
  });

  it('falls back to localhost when nothing was baked in', () => {
    expect(loadConfig(undefined, undefined).DEFAULT_API_BASE_URL).toBe('http://localhost:3000');
  });

  it('offers reviewer access only in the reviewer build, on the baked-in backend', () => {
    expect(loadConfig('https://api.saverlly.test', false).getReviewerApiBaseUrl()).toBeNull();
    expect(loadConfig('https://api.saverlly.test', true).getReviewerApiBaseUrl()).toBe('https://api.saverlly.test');
  });
});
