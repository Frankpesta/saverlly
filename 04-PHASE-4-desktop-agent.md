# Saverlly — Phase 4: Desktop Agent (exe)

**Prerequisite reading:** `00-PROJECT-OVERVIEW.md`, `01-PHASE-1-core-platform.md`, `02-PHASE-2-coupon-engine.md`, `03-PHASE-3-chrome-extension.md`

## Goal

Build the Windows desktop agent that gets installed once per kiosk computer. It registers the device against a kiosk location using a one-time setup code, handles getting the Chrome extension force-installed (and **re-asserted after any Chrome/machine reset**), hands the device token to the extension, displays kiosk announcements/ads, and keeps the device's status in sync with the backend. All kiosk computers are confirmed Windows — build for Windows only.

## Tech for This Phase

- Node.js, packaged as a Windows executable via `pkg`
- Runs as a background process (Windows service, via `node-windows` or similar, OR a simple always-running background app launched at every Windows login — the latter is likely the better fit given the reset behavior described below, since it needs to re-run its setup checks every session anyway)
- Windows Registry access (via `regedit` npm package or native `reg.exe` calls) for Chrome policy configuration
- Chrome Native Messaging host registration, for device-token hand-off to the extension

## Core Responsibilities

1. **One-time device registration via location setup code**
2. **Chrome extension force-install, with self-healing re-assertion every run**
3. **Device token hand-off to the extension**
4. **Announcement/ad display**
5. **Periodic status sync with backend**

## 1. Device Registration Flow (One-Time, Per Computer)

The setup code exists purely to **identify which kiosk/location a new computer belongs to** — there is no approval step to wait on, since the parent kiosk being `ACTIVE` is the only requirement.

1. On first run on a fresh computer, the agent has no stored identity. It prompts (via a simple local UI/console input) for a **location setup code** — a short, reusable code the kiosk owner generates once from their dashboard for a given location (`POST /locations/:id/setup-codes` from Phase 1). The same code can be entered on every computer at that location — it is not single-use per machine.
2. Agent generates a stable local device identifier (a UUID stored in a local config file, e.g. `%PROGRAMDATA%/KioskAgent/device.json` — not reliant solely on the Windows machine GUID, since that can be reset by imaging tools).
3. Agent calls `POST /devices/register` with the setup code + device identifier + basic machine metadata (hostname, OS version).
4. Backend validates the code is active and the parent kiosk is `ACTIVE`, creates the `Device` record, and returns a device token **in the same response** — no polling, no waiting.
5. Agent stores the token locally, encrypted at rest using Windows DPAPI (`%PROGRAMDATA%/KioskAgent/token.enc`).
6. This registration step never runs again on this machine unless the local identity file is deleted (e.g., full machine reimage) — see the reset-handling section below for what *does* need to re-run every session.

## 2. Chrome Extension Force-Install — With Self-Healing

Use Chrome's `ExtensionInstallForcelist` enterprise policy — the Google-supported, reliable way to silently install and lock an extension, rather than any custom installer trick.

**Key fact driving this design:** this registry-level policy is enforced by Chrome fresh on every launch — it is not part of the Chrome user profile, so a profile-only reset (cookies/passwords/logins wiped) does not remove it, and no reinstall action is needed in that case.

**However**, the client's kiosk computers reset Chrome to a clean state on every user logout, and the exact mechanism is not yet confirmed (see open question below) — it may be a full machine/snapshot restore (e.g., Deep Freeze, Reboot Restore Rx, disk imaging) rather than a profile-only reset. A full snapshot restore **could** revert the registry key itself, not just the Chrome profile. Since the agent already needs to run at every login to do its status/announcement sync, build the policy-write as something the agent **re-applies unconditionally on every startup**, not just once at initial install. This makes the system self-healing regardless of which reset method is actually in use, at negligible cost:

1. On every agent startup, write/re-write to the Windows Registry under:
   `HKEY_LOCAL_MACHINE\SOFTWARE\Policies\Google\Chrome\ExtensionInstallForcelist`
   with a value like: `<extension_id>;https://clients2.google.com/service/update2/crx` (if published to Chrome Web Store) or a private update URL (if distributing outside the store, at least initially, before store approval).
2. Also (re-)set `ExtensionInstallAllowlist` / anti-removal policy so kiosk users can't disable it from `chrome://extensions`.
3. Chrome picks up policy changes on next launch — since the agent runs at login (before/alongside Chrome typically opens), this ordering works naturally.
4. **Extension updates**: as long as the force-install value points to a proper update URL (Chrome Web Store's, or a self-hosted one following Chrome's update manifest XML format), Chrome handles checking for and applying extension updates natively — the agent does not need to manually push updates, it only needs to keep the policy pointing at a working update URL.

**Open dependency, not a blocker:** whether the extension is published to the Chrome Web Store affects exactly how the force-install URL is configured (store URL vs. self-hosted update manifest). Confirm with the client whether Web Store publishing is happening in parallel.

## 3. Device Token Hand-off to Extension

Since the extension can't read arbitrary files on disk (sandboxed), use **Chrome Native Messaging**:
1. Agent registers itself as a native messaging host (a manifest JSON file placed in a specific Windows registry-referenced location, per Chrome's native messaging spec) — this registration should also be re-asserted on every agent startup for the same self-healing reasons as the extension policy.
2. Extension's background service worker connects to the native host on startup via `chrome.runtime.connectNative(...)`.
3. Agent responds with the device token over this channel.
4. Extension stores it in `chrome.storage.local`.

## 4. Announcement / Ad Display

1. Agent polls `GET /announcements/active?locationId=...` every 60 seconds (short-poll is fine given announcements aren't second-sensitive).
2. `Announcement` model (add to Phase 1/relevant phase):
   ```prisma
   model Announcement {
     id            String    @id @default(uuid())
     kioskId       String
     kiosk         Kiosk     @relation(fields: [kioskId], references: [id])
     locationIds   String[]  // empty array = all locations for this kiosk
     title         String
     body          String
     mediaUrl      String?   // image/asset for the visual editor, Phase-dependent on Frontend doc
     startAt       DateTime
     endAt         DateTime
     repeatPolicy  String    // "once" | "every_login" | "max_n_times"
     maxDisplayCount Int?    // used when repeatPolicy = "max_n_times"
     createdAt     DateTime  @default(now())
   }
   ```
3. Announcements/ads render as a native overlay on the **main computer screen**, not inside the browser — this only works because the agent (not the extension) is what displays them, since the agent has desktop-level access the browser doesn't.
4. Agent tracks locally how many times a given announcement has been shown to the current OS session/user, respecting `repeatPolicy`:
   - `once` — show one time ever (or once per fresh Chrome/machine reset cycle — clarify with client which "ever" means, given the reset behavior)
   - `every_login` — show once per login session
   - `max_n_times` — show up to `maxDisplayCount` times total, then stop
5. Dismiss action (OK/close button) is a local-only interaction — no need to report dismissal back to the backend unless the client wants dismissal analytics (not currently in scope).

## 5. Periodic Sync

- Every poll cycle (recommend every 60 seconds, configurable), agent checks:
  - Kiosk status (`ACTIVE`/`INACTIVE`) and this device's `active` flag (kill-switch)
  - Any pending announcements
  - Re-asserts Chrome policy + native messaging host registration (self-healing, see above)
- On any "kiosk inactive" or "device disabled" response, agent should (a) stop serving the token to the extension (extension will then also detect this and go dormant per Phase 3), and (b) optionally show a subtle local indicator that the system is inactive, for troubleshooting purposes.

## Definition of Done

- [ ] Fresh agent install + valid location setup code results in a `Device` record created and a token issued immediately, no waiting/approval step
- [ ] The same setup code successfully registers multiple different computers against the same location
- [ ] Chrome extension is force-installed via registry policy and cannot be removed/disabled by the Windows user account running the kiosk session
- [ ] Simulate a full profile reset (clear Chrome user data) — extension remains installed with zero agent intervention needed
- [ ] Simulate a registry-level reset (manually clear the policy key) — agent restores it automatically on next startup, without needing the setup code again
- [ ] Extension successfully receives the device token via native messaging after both reset scenarios above
- [ ] An announcement created in the kiosk portal appears on the target device's main screen (not in-browser) within one polling cycle, respecting its `repeatPolicy`
- [ ] Setting a kiosk to `INACTIVE`, or a specific device's `active` to `false`, results in the agent stopping token distribution within one polling cycle

## Open Question for Client

What specific tool/method resets the kiosk computer on logout — Deep Freeze, a full machine snapshot/restore tool, or just a Chrome-level profile reset? This determines whether the self-healing re-apply logic above is a required safety net (full machine reset) or effectively redundant but harmless (profile-only reset). Build the self-healing approach regardless, since it's low-cost and correct either way — but the answer affects testing priorities.
