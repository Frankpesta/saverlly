import { getStoreSetup, type StoreSetupRecord } from "./store-setup";

// Which tabs an admin is setting a store up on. Shopper behaviour (checkout detection, the
// automatic popup, coupon runs, attribution, stand-down records) is paused on exactly those
// tabs and nowhere else.
//
// Kept in chrome.storage.session: it must survive the service worker being recycled mid-setup,
// but not a browser restart, after which there is no setup in progress to resume. Every read is
// checked against the live setup session and the store's domain, so a record can never outlive
// the session it was started for or follow the tab to another site.

const KEY = "storeSetupTabs";

export interface StoreSetupTab {
  sessionId: string;
  domain: string;
  startedAt: number;
  /** Where the admin is in the guided steps, so a reload or new page carries on from there.
   *  Opaque here; owned by the setup content script. */
  progress?: unknown;
}

/** Progress is a handful of selectors and choices; anything near this is a bug, not data. */
export const MAX_PROGRESS_BYTES = 32_000;

type Tabs = Record<string, StoreSetupTab>;

function bareHost(hostname: string): string {
  return hostname.toLowerCase().replace(/^www\./, "").replace(/\.$/, "");
}

/** The store's own domain or a subdomain of it ("checkout.shop.test"), never a lookalike
 *  ("evilshop.test", "shop.test.evil.example"). */
export function isOnStoreDomain(url: string | undefined, domain: string): boolean {
  if (!url) return false;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;
  const host = bareHost(parsed.hostname);
  const store = bareHost(domain);
  return host === store || host.endsWith(`.${store}`);
}

// Read-modify-write of one storage key from several event handlers: serialized so two
// updates landing together can't drop each other's change.
let queue: Promise<unknown> = Promise.resolve();
function update<T>(change: (tabs: Tabs) => T): Promise<T> {
  const run = queue.then(async () => {
    const tabs = ((await chrome.storage.session.get(KEY))[KEY] as Tabs | undefined) ?? {};
    const result = change(tabs);
    await chrome.storage.session.set({ [KEY]: tabs });
    return result;
  });
  queue = run.catch(() => undefined);
  return run;
}

async function read(): Promise<Tabs> {
  await queue;
  return ((await chrome.storage.session.get(KEY))[KEY] as Tabs | undefined) ?? {};
}

export function startStoreSetupOnTab(tabId: number, setup: StoreSetupRecord): Promise<StoreSetupTab> {
  return update((tabs) => {
    const tab = { sessionId: setup.sessionId, domain: setup.merchant.domain, startedAt: Date.now() };
    tabs[tabId] = tab;
    return tab;
  });
}

/** Ends setup on a tab. Resolves true if it was running there. */
export function stopStoreSetupOnTab(tabId: number): Promise<boolean> {
  return update((tabs) => {
    const had = String(tabId) in tabs;
    delete tabs[tabId];
    return had;
  });
}

/**
 * The tab's setup, if it is still valid: same live session, and (when a URL is given) still on
 * the store's site. Anything else is cleared on the spot and reported as not running, so the
 * caller simply carries on with normal shopper behaviour.
 */
export async function activeStoreSetupTab(tabId: number, url?: string): Promise<StoreSetupTab | null> {
  const tab = (await read())[tabId];
  if (!tab) return null;
  const setup = await getStoreSetup();
  const valid =
    setup?.sessionId === tab.sessionId && (url === undefined || isOnStoreDomain(url, tab.domain));
  if (valid) return tab;
  await stopStoreSetupOnTab(tabId);
  return null;
}

/** Saves the tab's progress. Resolves false if setup isn't running there or it is too large. */
export function saveStoreSetupProgress(tabId: number, sessionId: string, progress: unknown): Promise<boolean> {
  const size = JSON.stringify(progress ?? null).length;
  return update((tabs) => {
    const tab = tabs[tabId];
    if (!tab || tab.sessionId !== sessionId || size > MAX_PROGRESS_BYTES) return false;
    tab.progress = progress;
    return true;
  });
}

/** Ends setup on every tab not started for `keepSessionId`. Resolves the tabs it ended. */
export function clearStoreSetupTabs(keepSessionId?: string): Promise<number[]> {
  return update((tabs) => {
    const ended: number[] = [];
    for (const [id, tab] of Object.entries(tabs))
      if (tab.sessionId !== keepSessionId) {
        delete tabs[id];
        ended.push(Number(id));
      }
    return ended;
  });
}
