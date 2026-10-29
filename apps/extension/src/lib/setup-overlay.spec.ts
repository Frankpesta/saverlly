/**
 * @jest-environment jsdom
 */
import { SetupOverlay } from "./setup-overlay";
import { actionable, pick } from "./setup-picker";

function mountOverlay(onStop = jest.fn()) {
  const overlay = new SetupOverlay({ storeName: "Demo <b>Outfitters</b>", domain: "demo.test", onStop });
  overlay.mount();
  return overlay;
}
const host = () => document.querySelector("saverlly-store-setup") as HTMLElement;
const click = (target: EventTarget) =>
  target.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, composed: true }));

beforeEach(() => {
  document.documentElement.querySelectorAll("saverlly-store-setup").forEach((n) => n.remove());
  document.body.innerHTML = "";
});

describe("setup panel", () => {
  it("is out of reach of the store's scripts and styles", () => {
    mountOverlay();
    expect(host().parentElement).toBe(document.documentElement);
    expect(host().shadowRoot).toBeNull();
    expect(document.querySelector(".panel")).toBeNull();
  });

  it("renders every string as text, never markup", () => {
    const overlay = mountOverlay();
    overlay.render({
      step: { index: 2, total: 5 },
      title: '<img src=x onerror="alert(1)">',
      body: "Click <the> box",
      result: "Found <b>it</b>",
      detail: 'input[name="code"]',
      actions: [],
    });
    const panel = overlay.inspect();
    expect(panel.querySelector("img, b")).toBeNull();
    expect(panel.querySelector(".store")!.textContent).toBe("Setting up Demo <b>Outfitters</b> · demo.test");
    expect(panel.querySelector(".step")!.textContent).toBe("Step 2 of 5");
    expect(panel.querySelector(".title")!.textContent).toBe('<img src=x onerror="alert(1)">');
    expect(panel.querySelector(".detail")!.textContent).toBe('input[name="code"]');
  });

  it("runs actions, stops on request, switches sides and cleans up after itself", () => {
    const onStop = jest.fn();
    const overlay = mountOverlay(onStop);
    const onNext = jest.fn();
    overlay.render({
      title: "t",
      body: "b",
      actions: [
        { id: "next", label: "Continue", kind: "primary", onClick: onNext },
        { id: "off", label: "Nope", kind: "link", disabled: true, onClick: jest.fn() },
      ],
    });
    const panel = overlay.inspect();
    click(panel.querySelector('[data-action="next"]')!);
    expect(onNext).toHaveBeenCalledTimes(1);
    expect((panel.querySelector('[data-action="off"]') as HTMLButtonElement).disabled).toBe(true);

    click(panel.querySelector('[aria-label="Move this panel to the other side"]')!);
    expect(panel.dataset.side).toBe("left");
    click(panel.querySelector('[aria-label="Stop setup on this page"]')!);
    expect(onStop).toHaveBeenCalledTimes(1);

    overlay.destroy();
    expect(host()).toBeNull();
    expect(overlay.mounted).toBe(false);
  });
});

describe("using the panel", () => {
  it("is not a click on the store's page, so the store's outside-click handlers stay quiet", () => {
    const overlay = mountOverlay();
    const onNext = jest.fn();
    overlay.render({ title: "t", body: "b", actions: [{ id: "next", label: "Continue", kind: "primary", onClick: onNext }] });
    const storeSaw = jest.fn();
    for (const type of ["mousedown", "click", "keydown"]) {
      document.addEventListener(type, storeSaw);
      window.addEventListener(type, storeSaw);
    }
    const button = overlay.inspect().querySelector('[data-action="next"]')!;
    button.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, composed: true }));
    click(button);
    button.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, composed: true }));
    expect(onNext).toHaveBeenCalledTimes(1);
    expect(storeSaw).not.toHaveBeenCalled();
  });
});

describe("pick mode", () => {
  it("records the clicked element without the store ever seeing the click", async () => {
    document.body.innerHTML = `<form><button type="button" id="apply"><svg><path></path></svg>Apply</button></form>`;
    const storeSaw = jest.fn();
    for (const type of ["pointerdown", "mousedown", "click", "submit"]) document.addEventListener(type, storeSaw, true);
    const overlay = mountOverlay();
    const picked = pick({ overlay, label: "Apply button", resolve: actionable });

    const path = document.querySelector("path")!;
    for (const type of ["pointerdown", "mousedown"]) path.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true }));
    click(path);

    await expect(picked).resolves.toEqual({ kind: "picked", element: document.querySelector("#apply") });
    expect(storeSaw).not.toHaveBeenCalled();
    // Afterwards the page works normally again.
    click(document.querySelector("#apply")!);
    expect(storeSaw).toHaveBeenCalled();
  });

  it("lets the click reach the store when asked to (opening a hidden promo box)", async () => {
    document.body.innerHTML = `<a href="#" id="reveal">Have a promo code?</a>`;
    const storeSaw = jest.fn((event: Event) => event.preventDefault());
    document.querySelector("#reveal")!.addEventListener("click", storeSaw);
    const picked = pick({ overlay: mountOverlay(), label: "Promo code link", passThrough: true });
    click(document.querySelector("#reveal")!);
    await expect(picked).resolves.toMatchObject({ kind: "picked" });
    expect(storeSaw).toHaveBeenCalledTimes(1);
  });

  it("leaves the panel itself usable while picking", async () => {
    const overlay = mountOverlay();
    const onBack = jest.fn();
    overlay.render({ title: "t", body: "b", actions: [{ id: "back", label: "Back", kind: "link", onClick: onBack }] });
    let settled = false;
    void pick({ overlay, label: "x" }).then(() => (settled = true));
    click(overlay.inspect().querySelector('[data-action="back"]')!);
    await Promise.resolve();
    expect(onBack).toHaveBeenCalled();
    expect(settled).toBe(false);
  });

  it("stops on Escape or when aborted", async () => {
    const overlay = mountOverlay();
    const escaped = pick({ overlay, label: "x" });
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", cancelable: true }));
    await expect(escaped).resolves.toEqual({ kind: "cancelled" });

    const controller = new AbortController();
    const aborted = pick({ overlay, label: "x", signal: controller.signal });
    controller.abort();
    await expect(aborted).resolves.toEqual({ kind: "cancelled" });
  });

  it("reports elements a recipe can't use: frames and web components", async () => {
    document.body.innerHTML = `<iframe id="pay"></iframe><promo-box></promo-box>`;
    const overlay = mountOverlay();
    const inFrame = pick({ overlay, label: "x" });
    click(document.querySelector("#pay")!);
    await expect(inFrame).resolves.toEqual({ kind: "unsupported", reason: "frame" });

    const shadow = document.querySelector("promo-box")!.attachShadow({ mode: "open" });
    shadow.innerHTML = `<input>`;
    const inShadow = pick({ overlay, label: "x" });
    click(shadow.querySelector("input")!);
    await expect(inShadow).resolves.toEqual({ kind: "unsupported", reason: "shadow-root" });
  });

  it("notices a click that went into a frame, which the page itself never sees", async () => {
    jest.useFakeTimers();
    document.body.innerHTML = `<iframe id="pay"></iframe>`;
    const picked = pick({ overlay: mountOverlay(), label: "x" });
    (document.querySelector("#pay") as HTMLIFrameElement).focus();
    window.dispatchEvent(new Event("blur"));
    jest.runAllTimers();
    await expect(picked).resolves.toEqual({ kind: "unsupported", reason: "frame" });
    jest.useRealTimers();
  });

  it("never runs two picks at once: a new one cancels the old", async () => {
    document.body.innerHTML = `<input id="code">`;
    const overlay = mountOverlay();
    const first = pick({ overlay, label: "x" });
    const second = pick({ overlay, label: "y" });
    await expect(first).resolves.toEqual({ kind: "cancelled" });
    click(document.querySelector("#code")!);
    await expect(second).resolves.toMatchObject({ kind: "picked" });
  });

  it("ignores what the resolver rejects", async () => {
    document.body.innerHTML = `<p id="text">Order summary</p><input id="code">`;
    const picked = pick({
      overlay: mountOverlay(),
      label: "x",
      resolve: (target) => (target.localName === "input" ? target : null),
    });
    click(document.querySelector("#text")!);
    click(document.querySelector("#code")!);
    await expect(picked).resolves.toEqual({ kind: "picked", element: document.querySelector("#code") });
  });
});
