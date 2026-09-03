// scripts/build.js bakes SAVERLLY_API_BASE_URL (and SAVERLLY_EXTENSION_ID/
// SAVERLLY_EXTENSION_UPDATE_URL) into the bundle at build time if set in that build's
// environment, a real packaged exe has no runtime env var a kiosk owner could set. This
// process.env read below still matters for local dev (ts-node, unbaked builds).
export const DEFAULT_API_BASE_URL = 'http://localhost:3000';

export function getApiBaseUrl(): string {
  return process.env.SAVERLLY_API_BASE_URL || DEFAULT_API_BASE_URL;
}

// How often the agent re-checks kiosk/device status and re-asserts Chrome policy +
// native messaging registration.
export const STATUS_SYNC_INTERVAL_MS = 60_000;

// How often the agent polls for active announcements.
export const ANNOUNCEMENT_POLL_INTERVAL_MS = 60_000;
