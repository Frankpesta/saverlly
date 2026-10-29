// Fixtures for the store setup suite: Chromium with the built extension loaded, and a driver for
// the setup panel.
//
// The panel lives in a closed shadow root, so Playwright locators can't see inside it. The driver
// reads it through the DevTools protocol (DOM.getDocument with pierce), reads text with
// DOM.resolveNode, and clicks real mouse coordinates from DOM.getBoxModel, the way an admin would.
import { test as base, chromium, expect, type BrowserContext, type CDPSession, type Page, type Worker } from "@playwright/test";
import path from "node:path";
import { serve, type TestServer } from "./stores";

export { expect };

const EXTENSION = path.resolve(process.env.SETUP_E2E_EXTENSION ?? path.join(__dirname, "../../dist"));

/** The store every test sets up. The panel only runs on its domain. */
export const MERCHANT = { id: "m1", name: "Demo Outfitters", domain: "localhost" };

export async function waitFor<T>(fn: () => Promise<T | null | undefined | false>, what: string, timeout = 8000): Promise<T> {
  const deadline = Date.now() + timeout;
  for (;;) {
    const value = await fn();
    if (value) return value;
    if (Date.now() > deadline) throw new Error(`Timed out waiting for ${what}`);
    await new Promise((r) => setTimeout(r, 100));
  }
}

interface DomNode {
  backendNodeId: number;
  localName?: string;
  attributes?: string[];
  children?: DomNode[];
  shadowRoots?: (DomNode & { shadowRootType?: string })[];
  contentDocument?: DomNode;
}

/** One reading of the page, closed shadow roots included. */
async function snapshot(cdp: CDPSession) {
  const { root } = (await cdp.send("DOM.getDocument", { depth: -1, pierce: true })) as { root: DomNode };
  const nodes: DomNode[] = [];
  const walk = (node: DomNode) => {
    nodes.push(node);
    for (const child of [...(node.children ?? []), ...(node.shadowRoots ?? []), ...(node.contentDocument ? [node.contentDocument] : [])]) walk(child);
  };
  walk(root);
  const attr = (node: DomNode, name: string) => {
    const a = node.attributes ?? [];
    const i = a.indexOf(name);
    return i >= 0 ? a[i + 1] : undefined;
  };
  const call = async <T>(node: DomNode, fn: string): Promise<T> => {
    const { object } = await cdp.send("DOM.resolveNode", { backendNodeId: node.backendNodeId });
    const { result } = await cdp.send("Runtime.callFunctionOn", { objectId: object.objectId!, functionDeclaration: fn, returnByValue: true });
    return result.value as T;
  };
  const byClass = (className: string) => nodes.find((n) => (attr(n, "class") ?? "").split(" ").includes(className));
  const host = nodes.find((n) => n.localName === "saverlly-store-setup");
  return {
    host,
    shadowMode: host?.shadowRoots?.[0]?.shadowRootType,
    async text(className: string): Promise<string | undefined> {
      const node = byClass(className);
      return node ? call<string>(node, "function() { return this.textContent; }") : undefined;
    },
    /** The panel's list of notes, one string per line. */
    async notes(): Promise<string[]> {
      const node = byClass("notes");
      return node ? call<string[]>(node, "function() { return Array.from(this.children, (li) => li.textContent); }") : [];
    },
    async style(className: string, property: string): Promise<string> {
      const node = byClass(className);
      if (!node) throw new Error(`No .${className} in the panel`);
      return call<string>(node, `function() { return getComputedStyle(this).${property}; }`);
    },
    button: (by: string) => nodes.find((n) => n.localName === "button" && (attr(n, "data-action") === by || attr(n, "aria-label") === by)),
    async center(node: DomNode) {
      const { model } = await cdp.send("DOM.getBoxModel", { backendNodeId: node.backendNodeId });
      const [x1, y1, , , x3, y3] = model.content;
      return { x: (x1 + x3) / 2, y: (y1 + y3) / 2 };
    },
  };
}

export type PanelSnapshot = Awaited<ReturnType<typeof snapshot>>;

/** Drives the setup panel on one store tab. */
export async function setupPanel(context: BrowserContext, page: Page) {
  const cdp = await context.newCDPSession(page);
  const read = () => snapshot(cdp);
  const panel = {
    read,
    page,
    /** Waits for a step title and returns the panel as it is then. */
    onTitle: (title: string, timeout?: number) =>
      waitFor(async () => {
        const p = await read();
        return p.host && (await p.text("title")) === title ? p : null;
      }, `the panel to show "${title}"`, timeout),
    /** Waits for the picked selector the panel shows under a step. */
    onDetail: (detail: string) =>
      waitFor(async () => {
        const p = await read();
        return (await p.text("detail")) === detail ? p : null;
      }, `the panel to show the pick ${detail}`),
    /** Waits for any pick to be confirmed under the current step. */
    picked: () => waitFor(async () => !!(await (await read()).text("detail")), "a pick to be confirmed"),
    onResult: (pattern: RegExp) =>
      waitFor(async () => {
        const p = await read();
        return pattern.test((await p.text("result")) ?? "") ? p : null;
      }, `the panel to show a result matching ${pattern}`),
    /** Clicks a panel button by its data-action or aria-label, with a real mouse click. */
    async press(action: string) {
      const p = await read();
      const button = p.button(action);
      if (!button) throw new Error(`No "${action}" button in the panel`);
      const at = await p.center(button);
      await page.mouse.click(at.x, at.y);
    },
    closed: () => waitFor(async () => !(await read()).host, "the panel to close"),
  };
  return panel;
}

export type SetupPanel = Awaited<ReturnType<typeof setupPanel>>;

interface Fixtures {
  /** Chromium with the extension loaded, in a fresh profile. */
  context: BrowserContext;
  /** The extension's service worker, once the extension has finished starting. */
  worker: Worker;
  extensionId: string;
  /** Signs in as a setup admin for MERCHANT, as redeeming a dashboard code would. */
  signIn: () => Promise<void>;
  /** Starts setup on a store tab from the popup, as the popup's pill does. */
  startSetup: (store: Page) => Promise<SetupPanel>;
  /** The saved setup progress of a store tab. */
  progressOf: (store: Page) => Promise<Record<string, unknown>>;
  /** Serves a test store for the length of the test. */
  serveStore: (page: (url: string) => string, host?: string) => Promise<TestServer>;
  /** Attaches a screenshot to the test's report. */
  shot: (page: Page, name: string) => Promise<void>;
}

async function tabIdOf(worker: Worker, store: Page): Promise<number> {
  const pattern = `${new URL(store.url()).origin}/*`;
  return worker.evaluate(async (url) => (await chrome.tabs.query({ url }))[0].id!, pattern);
}

export const test = base.extend<Fixtures>({
  // The extension needs a persistent context; a new profile per test keeps tests independent.
  context: async ({}, use) => {
    const context = await chromium.launchPersistentContext("", {
      channel: "chromium",
      headless: !process.env.SETUP_E2E_HEADED,
      viewport: { width: 1100, height: 760 },
      args: [`--disable-extensions-except=${EXTENSION}`, `--load-extension=${EXTENSION}`],
    });
    await use(context);
    await context.close();
  },
  worker: async ({ context }, use) => {
    const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent("serviceworker"));
    // On install the extension sets itself dormant; wait so that doesn't land on top of a test's setup.
    await worker.evaluate(async () => {
      for (let i = 0; i < 100; i++) {
        if ((await chrome.storage.local.get("dormant")).dormant === true) break;
        await new Promise((r) => setTimeout(r, 50));
      }
    });
    await use(worker);
  },
  extensionId: async ({ worker }, use) => {
    await use(new URL(worker.url()).host);
  },
  signIn: async ({ worker }, use) => {
    await use(async () => {
      await worker.evaluate(async (merchant) => {
        await chrome.storage.local.set({
          storeSetupSession: {
            token: "T".repeat(43),
            // Nothing listens here: sending a draft fails, which is fine for these tests.
            apiBaseUrl: "http://127.0.0.1:9",
            sessionId: "s1",
            expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
            merchant,
          },
        });
      }, MERCHANT);
    });
  },
  startSetup: async ({ context, worker, extensionId }, use) => {
    await use(async (store) => {
      const tabId = await tabIdOf(worker, store);
      const popup = await context.newPage();
      await popup.goto(`chrome-extension://${extensionId}/popup/popup.html`);
      const started = await popup.evaluate((tabId) => chrome.runtime.sendMessage({ type: "STORE_SETUP_START_TAB", tabId }), tabId);
      expect(started).toEqual({ started: true });
      await popup.close();
      await store.bringToFront();
      return setupPanel(context, store);
    });
  },
  progressOf: async ({ worker }, use) => {
    await use(async (store) => {
      const tabId = await tabIdOf(worker, store);
      return worker.evaluate(async (t) => (await chrome.storage.session.get("storeSetupTabs")).storeSetupTabs[t].progress, tabId);
    });
  },
  serveStore: async ({}, use) => {
    const servers: TestServer[] = [];
    await use(async (page, host) => {
      const server = await serve(page, host);
      servers.push(server);
      return server;
    });
    await Promise.all(servers.map((server) => server.close()));
  },
  shot: async ({}, use, testInfo) => {
    await use(async (page, name) => {
      await testInfo.attach(name, { body: await page.screenshot(), contentType: "image/png" });
    });
  },
});

/**
 * The first steps on a store whose promo box is in view: the page, the box, the suggested apply
 * button, and the order total. `field` and `total` are what the admin clicks on the store.
 * Callers check the saved picks themselves.
 */
export async function pickBasics(panel: SetupPanel, clicks: { field: string; total: string }) {
  const store = panel.page;
  await panel.onTitle(`Set up ${MERCHANT.name}`);
  await panel.press("start");
  await panel.onTitle("Is this the checkout page?");
  await panel.press("next");
  await panel.onTitle("Can you see the promo code box?");
  await panel.press("visible");
  await panel.onTitle("Click the promo code box");
  await store.click(clicks.field);
  await panel.picked();
  await panel.press("next");
  await panel.onTitle("Click the apply button");
  await panel.press("yes");
  await panel.picked();
  await panel.press("next");
  await panel.onTitle("Click the order total");
  await store.click(clicks.total);
  await panel.onResult(/^Order total selected: /);
  await panel.press("next");
}
