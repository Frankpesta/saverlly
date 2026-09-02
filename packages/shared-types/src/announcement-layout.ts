/**
 * The freeform announcement layout: what the kiosk-owner's design canvas produces, what the
 * backend stores on `Announcement.layout`, and what the kiosk agent renders inside its WebView2
 * overlay.
 *
 * This module is deliberately the *only* place layout is turned into styles. The dashboard editor
 * and the kiosk renderer both go through `layoutElementStyle`, and the dashboard's preview pane
 * renders `renderAnnouncementLayoutHtml` output verbatim in an iframe — so "what you see in the
 * editor" and "what appears on the kiosk screen" cannot drift apart by construction.
 *
 * Everything here is pure and dependency-free: the agent runs it in plain Node, the backend runs
 * it to validate input, and the dashboard bundles it into the browser.
 */

export const ANNOUNCEMENT_LAYOUT_VERSION = 1;

/**
 * The design surface is a fixed pixel grid; the renderer scales it to whatever window it lands
 * in. A fixed grid is what makes a saved layout reproducible across kiosk screens of different
 * resolutions — positions are stored in canvas space, never in screen pixels or percentages.
 *
 * These are toast dimensions, not screen dimensions. The overlay is a card in the bottom-right
 * corner of the kiosk screen (the CorelDRAW/Windows-notification shape), so the canvas is a
 * portrait card and the agent sizes its window to exactly this many device-independent pixels —
 * which means the design renders at 1:1 and never gets blown up to fill a display.
 */
export const ANNOUNCEMENT_CANVAS_WIDTH = 400;
export const ANNOUNCEMENT_CANVAS_HEIGHT = 520;

/** Gap between the toast and the working area's right/bottom edges, in the same canvas-space
 *  pixels. Keeps the card clear of the taskbar and the notification tray. */
export const ANNOUNCEMENT_TOAST_MARGIN = 16;

/**
 * How long the toast stays up before sliding away on its own. A corner toast that waits forever
 * for a click is just a smaller version of the takeover it replaced — but this is long enough to
 * read a headline, an image and a line of body copy without hurrying.
 */
export const ANNOUNCEMENT_AUTO_DISMISS_MS = 20_000;

/** Slide-in and slide-out durations. The exit is deliberately shorter: an entrance wants to be
 *  noticed, a dismissal wants to be out of the way. */
const TOAST_ENTER_MS = 320;
const TOAST_EXIT_MS = 200;

/** Fonts that ship with a stock Windows install. The kiosk overlay renders offline with no
 *  webfont loading, so anything outside this list would silently fall back to a default and make
 *  the kiosk look nothing like the editor. The editor must offer only these. */
export const KIOSK_SAFE_FONTS = [
  'Segoe UI',
  'Arial',
  'Verdana',
  'Tahoma',
  'Trebuchet MS',
  'Georgia',
  'Times New Roman',
  'Courier New',
  'Impact',
] as const;

export type KioskSafeFont = (typeof KIOSK_SAFE_FONTS)[number];

export type LayoutElementType = 'text' | 'image' | 'button' | 'shape';

export interface LayoutElementBox {
  id: string;
  /** Top-left corner and size, in canvas-space pixels. */
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface TextLayoutElement extends LayoutElementBox {
  type: 'text';
  text: string;
  fontFamily: string;
  fontSize: number;
  fontWeight: number;
  color: string;
  align: 'left' | 'center' | 'right';
  italic: boolean;
}

export interface ImageLayoutElement extends LayoutElementBox {
  type: 'image';
  url: string;
  fit: 'cover' | 'contain';
  radius: number;
}

/** The dismiss affordance. Every layout needs a way out or the kiosk is stuck behind the
 *  overlay, which is why `ensureDismissable` exists and the editor won't let you delete the
 *  last one. */
export interface ButtonLayoutElement extends LayoutElementBox {
  type: 'button';
  label: string;
  backgroundColor: string;
  color: string;
  fontFamily: string;
  fontSize: number;
  fontWeight: number;
  radius: number;
}

export interface ShapeLayoutElement extends LayoutElementBox {
  type: 'shape';
  fill: string;
  radius: number;
}

export type AnnouncementLayoutElement =
  | TextLayoutElement
  | ImageLayoutElement
  | ButtonLayoutElement
  | ShapeLayoutElement;

export interface AnnouncementLayout {
  version: number;
  background: string;
  elements: AnnouncementLayoutElement[];
}

// ---------------------------------------------------------------------------
// Sanitizers
//
// A layout is authored by a kiosk owner and later rendered as HTML on a kiosk machine, so every
// value below is treated as untrusted input rather than as something the editor guarantees.
// Anything that doesn't validate falls back to a safe default instead of reaching the renderer.
// ---------------------------------------------------------------------------

const HEX_COLOR = /^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

export function isSafeColor(value: unknown): value is string {
  return typeof value === 'string' && (value === 'transparent' || HEX_COLOR.test(value));
}

function safeColor(value: unknown, fallback: string): string {
  return isSafeColor(value) ? value : fallback;
}

/**
 * Only absolute http(s) URLs are allowed through, and only ones free of characters that could
 * break out of the `url("…")` CSS context or an HTML attribute. `javascript:`/`data:` are
 * rejected outright — this string ends up inside a page that runs on a kiosk we control.
 */
export function isSafeImageUrl(value: unknown): value is string {
  if (typeof value !== 'string' || value.length === 0 || value.length > 2048) return false;
  if (!/^https?:\/\//i.test(value)) return false;
  return !/["'()\\<>\s]/.test(value);
}

function safeNumber(value: unknown, fallback: number, min: number, max: number): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

function safeText(value: unknown, fallback: string, maxLength = 2000): string {
  if (typeof value !== 'string') return fallback;
  return value.slice(0, maxLength);
}

function safeFont(value: unknown): string {
  return typeof value === 'string' && (KIOSK_SAFE_FONTS as readonly string[]).includes(value)
    ? value
    : 'Segoe UI';
}

function safeEnum<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : fallback;
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

let idCounter = 0;

/** Ids only need to be unique within one layout — they're React keys and selection handles,
 *  never persisted foreign keys — so a counter plus a random suffix is plenty. */
export function createElementId(type: LayoutElementType): string {
  idCounter += 1;
  return `${type}-${idCounter}-${Math.random().toString(36).slice(2, 8)}`;
}

function parseElement(raw: unknown): AnnouncementLayoutElement | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const input = raw as Record<string, unknown>;
  const type = safeEnum<LayoutElementType>(
    input.type,
    ['text', 'image', 'button', 'shape'],
    'text',
  );

  const box: LayoutElementBox = {
    id: typeof input.id === 'string' && input.id.length > 0 ? input.id.slice(0, 64) : createElementId(type),
    x: safeNumber(input.x, 0, -ANNOUNCEMENT_CANVAS_WIDTH, ANNOUNCEMENT_CANVAS_WIDTH * 2),
    y: safeNumber(input.y, 0, -ANNOUNCEMENT_CANVAS_HEIGHT, ANNOUNCEMENT_CANVAS_HEIGHT * 2),
    width: safeNumber(input.width, 200, 8, ANNOUNCEMENT_CANVAS_WIDTH * 2),
    height: safeNumber(input.height, 80, 8, ANNOUNCEMENT_CANVAS_HEIGHT * 2),
  };

  switch (type) {
    case 'image': {
      if (!isSafeImageUrl(input.url)) return null; // an image with no usable source is just a hole
      return {
        ...box,
        type: 'image',
        url: input.url,
        fit: safeEnum(input.fit, ['cover', 'contain'] as const, 'cover'),
        radius: safeNumber(input.radius, 0, 0, 999),
      };
    }
    case 'button':
      return {
        ...box,
        type: 'button',
        label: safeText(input.label, 'Dismiss', 120),
        backgroundColor: safeColor(input.backgroundColor, '#0f766e'),
        color: safeColor(input.color, '#ffffff'),
        fontFamily: safeFont(input.fontFamily),
        fontSize: safeNumber(input.fontSize, 18, 8, 200),
        fontWeight: safeNumber(input.fontWeight, 600, 100, 900),
        radius: safeNumber(input.radius, 8, 0, 999),
      };
    case 'shape':
      return {
        ...box,
        type: 'shape',
        fill: safeColor(input.fill, '#e2e8f0'),
        radius: safeNumber(input.radius, 0, 0, 999),
      };
    case 'text':
    default:
      return {
        ...box,
        type: 'text',
        text: safeText(input.text, ''),
        fontFamily: safeFont(input.fontFamily),
        fontSize: safeNumber(input.fontSize, 24, 8, 200),
        fontWeight: safeNumber(input.fontWeight, 400, 100, 900),
        color: safeColor(input.color, '#111111'),
        align: safeEnum(input.align, ['left', 'center', 'right'] as const, 'left'),
        italic: input.italic === true,
      };
  }
}

/**
 * Coerces arbitrary stored JSON into a renderable layout, or returns null when it isn't one.
 * Individual bad elements are dropped rather than failing the whole layout — one broken image
 * shouldn't blank an announcement that's already live on kiosk screens.
 */
export function parseAnnouncementLayout(value: unknown): AnnouncementLayout | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  if (!Array.isArray(input.elements)) return null;

  const elements = input.elements
    .slice(0, 50) // a kiosk announcement with 50+ elements is a bug or an attack, not a design
    .map(parseElement)
    .filter((element): element is AnnouncementLayoutElement => element !== null);

  return {
    version: safeNumber(input.version, ANNOUNCEMENT_LAYOUT_VERSION, 1, 99),
    background: safeColor(input.background, '#ffffff'),
    elements,
  };
}

/** True when `value` is a layout the renderer can use. Written for the backend's DTO validator,
 *  which needs a boolean rather than a coerced value. */
export function isAnnouncementLayout(value: unknown): boolean {
  return parseAnnouncementLayout(value) !== null;
}

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

/**
 * The layout an announcement gets when it has none: image (optional), title, body and a dismiss
 * button stacked down the toast card. This is what makes every pre-canvas announcement still
 * render on the new pipeline, and it's the starting point the editor opens with so a kiosk owner
 * never faces an empty canvas.
 *
 * The image starts below the chrome close button's corner rather than at the very top edge, so
 * the × never lands on a face or a logo in the default arrangement.
 */
export function createDefaultLayout(source: {
  title?: string;
  body?: string;
  mediaUrl?: string | null;
}): AnnouncementLayout {
  const hasImage = isSafeImageUrl(source.mediaUrl);
  const elements: AnnouncementLayoutElement[] = [];

  if (hasImage) {
    elements.push({
      id: createElementId('image'),
      type: 'image',
      x: 24,
      y: 48,
      width: 352,
      height: 176,
      url: source.mediaUrl as string,
      fit: 'cover',
      radius: 10,
    });
  }

  elements.push({
    id: createElementId('text'),
    type: 'text',
    x: 24,
    y: hasImage ? 248 : 152,
    width: 352,
    height: 56,
    text: source.title ?? '',
    fontFamily: 'Segoe UI',
    fontSize: 26,
    fontWeight: 700,
    color: '#111111',
    align: 'center',
    italic: false,
  });

  elements.push({
    id: createElementId('text'),
    type: 'text',
    x: 24,
    y: hasImage ? 312 : 216,
    width: 352,
    height: 128,
    text: source.body ?? '',
    fontFamily: 'Segoe UI',
    fontSize: 16,
    fontWeight: 400,
    color: '#444444',
    align: 'center',
    italic: false,
  });

  elements.push({
    id: createElementId('button'),
    type: 'button',
    x: 120,
    y: 452,
    width: 160,
    height: 44,
    label: 'Dismiss',
    backgroundColor: '#0f766e',
    color: '#ffffff',
    fontFamily: 'Segoe UI',
    fontSize: 16,
    fontWeight: 600,
    radius: 8,
  });

  return { version: ANNOUNCEMENT_LAYOUT_VERSION, background: '#ffffff', elements };
}

/**
 * Guarantees the layout contains at least one button.
 *
 * Less load-bearing than it was: the toast now always draws its own chrome close button and
 * dismisses itself on a timer, so a buttonless design is no longer a kiosk that can't be
 * reclaimed. It stays because a designed, labelled call to action is a better dismiss affordance
 * than a 28px ×, and a layout that lost its only button to an editing mistake should still get
 * one back.
 */
export function ensureDismissable(layout: AnnouncementLayout): AnnouncementLayout {
  if (layout.elements.some((element) => element.type === 'button')) return layout;
  return {
    ...layout,
    elements: [
      ...layout.elements,
      {
        id: createElementId('button'),
        type: 'button',
        x: ANNOUNCEMENT_CANVAS_WIDTH / 2 - 80,
        y: ANNOUNCEMENT_CANVAS_HEIGHT - 68,
        width: 160,
        height: 44,
        label: 'Dismiss',
        backgroundColor: '#0f766e',
        color: '#ffffff',
        fontFamily: 'Segoe UI',
        fontSize: 18,
        fontWeight: 600,
        radius: 8,
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Styling — shared by the React editor and the HTML renderer
// ---------------------------------------------------------------------------

export type StyleMap = Record<string, string>;

export interface LayoutStyleOptions {
  /**
   * Last-moment rewrite of an image element's URL, applied only when the styles are built —
   * never to the stored layout.
   *
   * This exists because the two renderers reach images over different transports. The kiosk
   * agent loads them directly from the backend and must use the URL exactly as saved. The
   * dashboard runs on HTTPS while the backend serves uploads over plain HTTP (no TLS yet — see
   * DEPLOYMENT.md's known limitations), so a raw `url("http://…")` is mixed content: the
   * browser blocks it silently, with no console error and no broken-image icon, and the design
   * simply appears to have no image in it. The dashboard therefore passes a resolver that
   * routes through its own same-origin image proxy.
   *
   * Only the URL changes — position, size, fit and radius all still come from the one shared
   * definition below, so the editor still cannot drift from what the kiosk draws.
   */
  resolveImageUrl?: (url: string) => string;
}

/**
 * The visual definition of an element, in camelCase so it can be handed straight to React's
 * `style` prop. `styleMapToCssText` converts the same map for the HTML renderer, which is what
 * keeps the editor and the kiosk pixel-identical.
 */
export function layoutElementStyle(
  element: AnnouncementLayoutElement,
  options: LayoutStyleOptions = {},
): StyleMap {
  const base: StyleMap = {
    position: 'absolute',
    left: `${element.x}px`,
    top: `${element.y}px`,
    width: `${element.width}px`,
    height: `${element.height}px`,
    boxSizing: 'border-box',
  };

  switch (element.type) {
    case 'text':
      return {
        ...base,
        display: 'flex',
        alignItems: 'center',
        justifyContent:
          element.align === 'center' ? 'center' : element.align === 'right' ? 'flex-end' : 'flex-start',
        fontFamily: `'${element.fontFamily}', sans-serif`,
        fontSize: `${element.fontSize}px`,
        fontWeight: String(element.fontWeight),
        fontStyle: element.italic ? 'italic' : 'normal',
        color: element.color,
        textAlign: element.align,
        lineHeight: '1.3',
        whiteSpace: 'pre-wrap',
        overflow: 'hidden',
        wordBreak: 'break-word',
      };
    case 'image':
      return {
        ...base,
        backgroundImage: `url("${options.resolveImageUrl ? options.resolveImageUrl(element.url) : element.url}")`,
        backgroundSize: element.fit,
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
        borderRadius: `${element.radius}px`,
      };
    case 'button':
      return {
        ...base,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: element.backgroundColor,
        color: element.color,
        fontFamily: `'${element.fontFamily}', sans-serif`,
        fontSize: `${element.fontSize}px`,
        fontWeight: String(element.fontWeight),
        borderRadius: `${element.radius}px`,
        border: 'none',
        cursor: 'pointer',
        textAlign: 'center',
        overflow: 'hidden',
      };
    case 'shape':
      return {
        ...base,
        backgroundColor: element.fill,
        borderRadius: `${element.radius}px`,
      };
  }
}

function camelToKebab(property: string): string {
  return property.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
}

export function styleMapToCssText(style: StyleMap): string {
  return Object.entries(style)
    .map(([property, value]) => `${camelToKebab(property)}:${value}`)
    .join(';');
}

// ---------------------------------------------------------------------------
// HTML renderer — what the kiosk's WebView2 overlay loads
// ---------------------------------------------------------------------------

function renderElementHtml(
  element: AnnouncementLayoutElement,
  options: LayoutStyleOptions = {},
): string {
  const style = escapeHtml(styleMapToCssText(layoutElementStyle(element, options)));

  switch (element.type) {
    case 'text':
      return `<div style="${style}">${escapeHtml(element.text)}</div>`;
    case 'image':
      // Presentational: the alt text would never be read out on a kiosk overlay, and an empty
      // alt is the correct signal for a purely decorative background image.
      return `<div style="${style}" role="presentation"></div>`;
    case 'button':
      return `<button type="button" style="${style}" data-saverlly-dismiss>${escapeHtml(element.label)}</button>`;
    case 'shape':
      return `<div style="${style}" role="presentation"></div>`;
  }
}

/**
 * A complete, self-contained HTML document for the layout — no external CSS, no fonts to fetch,
 * no network at all beyond the image URLs themselves. The kiosk agent writes this to disk and
 * points its WebView2 overlay at it; the dashboard drops the identical string into an iframe so
 * the preview is the real renderer rather than a lookalike.
 *
 * The document is the toast card itself, not a screen containing one: the agent sizes its window
 * to exactly the canvas dimensions, so the design renders 1:1 and the `fit` scale below only ever
 * shrinks — never enlarges — the card. Enlarging is what made the old full-screen overlay look
 * soft, since a 960px-wide design blown up to a 1920px screen is a 2× upscale of every glyph
 * boundary the layout was authored against.
 *
 * Two dismiss affordances are always present regardless of what the owner designed: the chrome
 * close button in the card's corner, and the auto-dismiss timer.
 */
export function renderAnnouncementLayoutHtml(
  layout: AnnouncementLayout,
  options: { interactive?: boolean } & LayoutStyleOptions = {},
): string {
  const safe = ensureDismissable(parseAnnouncementLayout(layout) ?? createDefaultLayout({}));
  const interactive = options.interactive !== false;

  // The preview is a still life: it must not slide itself off the page 20 seconds after a kiosk
  // owner opens the editor, and it has no host to post a dismissal to.
  const behaviourScript = interactive
    ? `<script>
(function () {
  var shell = document.getElementById('shell');
  var dismissed = false;

  function dismiss() {
    if (dismissed) return;
    dismissed = true;
    shell.className = 'leaving';
    // Let the exit animation finish before the window disappears — closing on the click itself
    // makes the toast vanish rather than leave.
    window.setTimeout(function () {
      // The WinForms host listens for this and closes the window. window.close() is the fallback
      // for a plain browser context, where it is simply a no-op.
      if (window.chrome && window.chrome.webview) {
        window.chrome.webview.postMessage('saverlly:dismiss');
      } else {
        window.close();
      }
    }, ${TOAST_EXIT_MS});
  }

  document.addEventListener('click', function (event) {
    if (event.target.closest('[data-saverlly-dismiss]')) dismiss();
  });

  window.setTimeout(dismiss, ${ANNOUNCEMENT_AUTO_DISMISS_MS});
})();
</script>`
    : '';

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Announcement</title>
<style>
  * { margin: 0; padding: 0; }
  html, body {
    width: 100%; height: 100%; overflow: hidden;
    background: ${escapeHtml(safe.background)};
    font-family: 'Segoe UI', sans-serif;
    ${interactive ? '' : 'pointer-events: none;'}
  }
  body { display: flex; align-items: center; justify-content: center; }
  /* The card. Animated with the standalone \`translate\`/\`scale\` properties rather than
     \`transform\`, so the entrance animation and the fit scale compose instead of overwriting
     each other. */
  #shell {
    position: relative;
    width: ${ANNOUNCEMENT_CANVAS_WIDTH}px;
    height: ${ANNOUNCEMENT_CANVAS_HEIGHT}px;
    flex: none;
    scale: var(--fit, 1);
    animation: saverlly-rise ${TOAST_ENTER_MS}ms cubic-bezier(0.16, 1, 0.3, 1) both;
  }
  #shell.leaving { animation: saverlly-sink ${TOAST_EXIT_MS}ms ease-in both; }
  @keyframes saverlly-rise {
    from { translate: 0 ${Math.round(ANNOUNCEMENT_CANVAS_HEIGHT / 12)}px; opacity: 0; }
    to { translate: 0 0; opacity: 1; }
  }
  @keyframes saverlly-sink {
    from { translate: 0 0; opacity: 1; }
    to { translate: 0 24px; opacity: 0; }
  }
  /* Motion is decoration here; the announcement itself must still arrive. */
  @media (prefers-reduced-motion: reduce) {
    #shell, #shell.leaving { animation-duration: 1ms; }
  }
  #stage {
    position: absolute;
    inset: 0;
    background: ${escapeHtml(safe.background)};
    /* Clips anything dragged past the card's edge, including designs authored against the older,
       larger canvas — a partial element at the boundary looks intentional, one bleeding into the
       window edge does not. */
    overflow: hidden;
  }
  /* Renderer-owned, not part of the design: every toast closes the same way no matter what the
     kiosk owner drew, and it sits above the stage so it is never buried under an element. */
  #chrome-close {
    position: absolute;
    top: 10px; right: 10px;
    z-index: 1;
    display: flex; align-items: center; justify-content: center;
    width: 28px; height: 28px;
    border: none; border-radius: 50%;
    background: rgba(15, 23, 42, 0.55);
    color: #ffffff;
    cursor: pointer;
    transition: background 150ms ease;
  }
  #chrome-close:hover { background: rgba(15, 23, 42, 0.78); }
</style>
</head>
<body>
<div id="shell">
<div id="stage">
${safe.elements.map((element) => renderElementHtml(element, options)).join('\n')}
</div>
<button id="chrome-close" type="button" data-saverlly-dismiss aria-label="Close announcement">
<svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true" focusable="false"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" fill="none"/></svg>
</button>
</div>
<script>
// Scale the fixed design grid down to the window when it can't fit, instead of laying out
// responsively — the layout was authored against exact coordinates, so uniform scaling is the
// only transform that preserves it faithfully. Capped at 1: the agent sizes the window to the
// card, and upscaling a design past its authored size is exactly the softness this replaced.
(function () {
  var shell = document.getElementById('shell');
  function fit() {
    var scale = Math.min(
      1,
      window.innerWidth / ${ANNOUNCEMENT_CANVAS_WIDTH},
      window.innerHeight / ${ANNOUNCEMENT_CANVAS_HEIGHT}
    );
    shell.style.setProperty('--fit', scale);
  }
  fit();
  window.addEventListener('resize', fit);
})();
</script>
${behaviourScript}
</body>
</html>`;
}
