import { formatTimeLeft, type StoreSetupStatus } from "../lib/store-setup";
import type { StoreSetupMessage } from "../lib/messages";

const app = document.getElementById("app") as HTMLElement;
const SESSION_KEY = "storeSetupSession";
// Minutes are the finest unit shown, so a 30s tick keeps the countdown at most half a minute stale.
const TICK_MS = 30_000;

let current: StoreSetupStatus | null = null;
let ticker: ReturnType<typeof setInterval> | undefined;

function send(message: StoreSetupMessage): Promise<unknown> {
  return chrome.runtime.sendMessage(message);
}

async function loadStatus(verify: boolean): Promise<StoreSetupStatus | null> {
  const response = (await send({ type: "STORE_SETUP_STATUS", verify }).catch(
    () => null,
  )) as { setup?: StoreSetupStatus | null } | null;
  return response?.setup ?? null;
}

function render(setup: StoreSetupStatus | null): void {
  current = setup;
  clearInterval(ticker);
  if (setup) renderActive(setup);
  else renderStart();
}

function renderStart(): void {
  app.dataset.view = "start";
  app.innerHTML = `
    <h1 class="setup__title">Set up a store</h1>
    <p class="setup__text">On the Saverlly dashboard, open the store and choose <strong>Set up with extension</strong>. Enter the code shown there.</p>
    <form id="setup-form" class="setup__form" novalidate>
      <label class="setup__label" for="setup-code">Setup code</label>
      <input id="setup-code" class="setup__input" type="text" required maxlength="20" autocomplete="off" spellcheck="false" placeholder="SET-XXXX-XXXX" aria-describedby="setup-error" />
      <p id="setup-error" class="setup__error" role="alert"></p>
      <button id="setup-submit" class="setup__button" type="submit">Start setup</button>
    </form>`;
  const form = document.getElementById("setup-form") as HTMLFormElement;
  const input = document.getElementById("setup-code") as HTMLInputElement;
  const button = document.getElementById("setup-submit") as HTMLButtonElement;
  const error = document.getElementById("setup-error") as HTMLElement;
  input.focus();
  input.addEventListener("input", () => {
    input.removeAttribute("aria-invalid");
    error.textContent = "";
  });
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    if (button.disabled) return;
    if (!input.value.trim()) {
      input.setAttribute("aria-invalid", "true");
      error.textContent = "Enter the setup code shown on the dashboard.";
      return;
    }
    button.disabled = true;
    button.textContent = "Connecting…";
    error.textContent = "";
    void send({ type: "STORE_SETUP_REDEEM", code: input.value })
      .then((result) => {
        const response = result as { setup?: StoreSetupStatus; error?: string } | undefined;
        if (!response?.setup)
          throw new Error(response?.error ?? "Could not start store setup. Please try again.");
        render(response.setup);
      })
      .catch((reason: unknown) => {
        input.setAttribute("aria-invalid", "true");
        error.textContent =
          reason instanceof Error ? reason.message : "Could not start store setup. Please try again.";
        button.disabled = false;
        button.textContent = "Start setup";
        input.focus();
      });
  });
}

function renderActive(setup: StoreSetupStatus): void {
  app.dataset.view = "active";
  app.innerHTML = `
    <h1 class="setup__title">Setting up <span id="setup-name"></span></h1>
    <p id="setup-domain" class="setup__domain"></p>
    <p class="setup__status"><span class="setup__dot" aria-hidden="true"></span><span>Session ends in <span id="setup-time"></span></span></p>
    <p class="setup__text">In this browser, go to <strong id="setup-domain-inline"></strong>, add an item to the cart and open the checkout page.</p>
    <button id="setup-end" class="setup__button setup__button--outline" type="button">End setup</button>`;
  // Store names and domains come from the server: text only, never markup.
  document.getElementById("setup-name")!.textContent = setup.merchant.name;
  document.getElementById("setup-domain")!.textContent = setup.merchant.domain;
  document.getElementById("setup-domain-inline")!.textContent = setup.merchant.domain;
  const time = document.getElementById("setup-time") as HTMLElement;
  const tick = () => {
    if (Date.parse(setup.expiresAt) <= Date.now()) {
      // Reading the status clears the expired session.
      void loadStatus(false).then(render);
      return;
    }
    time.textContent = formatTimeLeft(setup.expiresAt);
  };
  tick();
  ticker = setInterval(tick, TICK_MS);

  const end = document.getElementById("setup-end") as HTMLButtonElement;
  end.addEventListener("click", () => {
    end.disabled = true;
    end.textContent = "Ending…";
    void send({ type: "STORE_SETUP_END" })
      .catch(() => undefined)
      .then(() => loadStatus(false))
      .then(render);
  });
}

// Started, replaced or ended elsewhere (the popup, another options tab, a rejected request).
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local" || !(SESSION_KEY in changes)) return;
  void loadStatus(false).then((setup) => {
    if (setup?.sessionId !== current?.sessionId) render(setup);
  });
});

// Coming back to the tab re-checks with the backend, since the dashboard may have ended it.
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && current) void loadStatus(true).then(render);
});

void loadStatus(true).then(render);
