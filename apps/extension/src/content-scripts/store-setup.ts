import type { StoreSetupSubmitResult, StoreSetupTabContext, StoreSetupTabMessage } from "../lib/messages";
import { STORE_SETUP_OVERLAY_CLOSE } from "../lib/messages";
import { parseProgress, runSetupFlow, type SetupProgress } from "../lib/setup-flow";
import { SetupOverlay } from "../lib/setup-overlay";

// Injected by the service worker into the top frame of a tab where an admin is setting the
// store up: once when setup starts there, and again on every new page on the store. It asks
// the worker for its context (which also proves this tab is still the setup tab), draws the
// step panel and runs the guided steps until setup is stopped.

function send(message: StoreSetupTabMessage): Promise<unknown> {
  return Promise.resolve(chrome.runtime.sendMessage(message)).catch(() => null);
}

(async function main() {
  // Injection repeats on every page load and may race a same-document re-injection.
  if (window.__SAVERLLY_SETUP__) return;
  window.__SAVERLLY_SETUP__ = true;

  const context = (await send({ type: "STORE_SETUP_TAB_CONTEXT" })) as StoreSetupTabContext | null;
  if (!context) {
    window.__SAVERLLY_SETUP__ = false;
    return;
  }

  const controller = new AbortController();
  const onMessage = (message: { type?: string }) => {
    if (message?.type === STORE_SETUP_OVERLAY_CLOSE) close();
  };
  const close = () => {
    if (controller.signal.aborted) return;
    controller.abort();
    chrome.runtime.onMessage.removeListener(onMessage);
    overlay.destroy();
    window.__SAVERLLY_SETUP__ = false;
  };
  const stop = () => {
    close();
    void send({ type: "STORE_SETUP_TAB_STOP" });
  };
  const overlay = new SetupOverlay({ storeName: context.storeName, domain: context.domain, onStop: stop });
  chrome.runtime.onMessage.addListener(onMessage);
  overlay.mount();

  await runSetupFlow({
    overlay,
    storeName: context.storeName,
    domain: context.domain,
    progress: parseProgress(context.progress),
    save: async (progress: SetupProgress) => {
      await send({ type: "STORE_SETUP_TAB_PROGRESS", progress });
    },
    submit: async (payload) =>
      ((await send({ type: "STORE_SETUP_TAB_SUBMIT", payload })) as StoreSetupSubmitResult | null) ?? {
        ok: false,
        ended: false,
        error: "Could not reach Saverlly. Reload the page and try again.",
      },
    stop,
    signal: controller.signal,
  });
})();
