// Test helper only (not a spec): a stand-in for ScrapeHealthService in runner unit tests.
/** A ScrapeHealthService that records calls and never pauses a site. */
export function fakeHealth() {
  return {
    pausedUntil: jest.fn().mockResolvedValue(null),
    recordRun: jest.fn().mockResolvedValue(undefined),
    afterBlock: jest.fn().mockResolvedValue(undefined),
    checkSiteDown: jest.fn().mockResolvedValue(undefined),
  };
}
