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

/** The design surface is a fixed pixel grid; the renderer scales it to whatever window it lands
 *  in. A fixed grid is what makes a saved layout reproducible across kiosk screens of different
 *  resolutions — positions are stored in canvas space, never in screen pixels or percentages. */
export const ANNOUNCEMENT_CANVAS_WIDTH = 960;
export const ANNOUNCEMENT_CANVAS_HEIGHT = 600;

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
 * The layout an announcement gets when it has none: title, body and (optionally) image arranged
 * the way the old fixed WinForms overlay stacked them. This is what makes every pre-canvas
 * announcement still render on the new pipeline, and it's the starting point the editor opens
 * with so a kiosk owner never faces an empty canvas.
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
      x: 80,
      y: 48,
      width: 800,
      height: 240,
      url: source.mediaUrl as string,
      fit: 'cover',
      radius: 12,
    });
  }

  elements.push({
    id: createElementId('text'),
    type: 'text',
    x: 80,
    y: hasImage ? 316 : 120,
    width: 800,
    height: 64,
    text: source.title ?? '',
    fontFamily: 'Segoe UI',
    fontSize: 40,
    fontWeight: 700,
    color: '#111111',
    align: 'center',
    italic: false,
  });

  elements.push({
    id: createElementId('text'),
    type: 'text',
    x: 80,
    y: hasImage ? 392 : 200,
    width: 800,
    height: 120,
    text: source.body ?? '',
    fontFamily: 'Segoe UI',
    fontSize: 24,
    fontWeight: 400,
    color: '#444444',
    align: 'center',
    italic: false,
  });

  elements.push({
    id: createElementId('button'),
    type: 'button',
    x: 400,
    y: hasImage ? 520 : 360,
    width: 160,
    height: 52,
    label: 'Dismiss',
    backgroundColor: '#0f766e',
    color: '#ffffff',
    fontFamily: 'Segoe UI',
    fontSize: 18,
    fontWeight: 600,
    radius: 8,
  });

  return { version: ANNOUNCEMENT_LAYOUT_VERSION, background: '#ffffff', elements };
}

/**
 * Guarantees the layout contains at least one button. Without one, the kiosk user has no way to
 * close the overlay and the machine is effectively bricked until the agent restarts — so this is
 * enforced at render time, not just in the editor's UI.
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
        y: ANNOUNCEMENT_CANVAS_HEIGHT - 80,
        width: 160,
        height: 52,
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

/**
 * The visual definition of an element, in camelCase so it can be handed straight to React's
 * `style` prop. `styleMapToCssText` converts the same map for the HTML renderer, which is what
 * keeps the editor and the kiosk pixel-identical.
 */
export function layoutElementStyle(element: AnnouncementLayoutElement): StyleMap {
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
        backgroundImage: `url("${element.url}")`,
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

function renderElementHtml(element: AnnouncementLayoutElement): string {
  const style = escapeHtml(styleMapToCssText(layoutElementStyle(element)));

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
 * The stage is scaled to fit whatever viewport it lands in, so one saved layout renders correctly
 * on a 1366×768 kiosk and a 4K screen alike.
 */
export function renderAnnouncementLayoutHtml(
  layout: AnnouncementLayout,
  options: { interactive?: boolean } = {},
): string {
  const safe = ensureDismissable(parseAnnouncementLayout(layout) ?? createDefaultLayout({}));
  const interactive = options.interactive !== false;

  const dismissScript = interactive
    ? `<script>
document.addEventListener('click', function (event) {
  var target = event.target.closest('[data-saverlly-dismiss]');
  if (!target) return;
  // The WinForms host listens for this and closes the window. window.close() is the fallback
  // for a plain browser context (the dashboard preview), where it is simply a no-op.
  if (window.chrome && window.chrome.webview) {
    window.chrome.webview.postMessage('saverlly:dismiss');
  } else {
    window.close();
  }
});
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
  #stage {
    position: relative;
    width: ${ANNOUNCEMENT_CANVAS_WIDTH}px;
    height: ${ANNOUNCEMENT_CANVAS_HEIGHT}px;
    background: ${escapeHtml(safe.background)};
    flex: none;
  }
</style>
</head>
<body>
<div id="stage">
${safe.elements.map(renderElementHtml).join('\n')}
</div>
<script>
// Scale the fixed design grid to the actual window instead of laying out responsively — the
// layout was authored against exact coordinates, so uniform scaling is the only transform that
// preserves it faithfully.
(function () {
  var stage = document.getElementById('stage');
  function fit() {
    var scale = Math.min(
      window.innerWidth / ${ANNOUNCEMENT_CANVAS_WIDTH},
      window.innerHeight / ${ANNOUNCEMENT_CANVAS_HEIGHT}
    );
    stage.style.transform = 'scale(' + scale + ')';
  }
  fit();
  window.addEventListener('resize', fit);
})();
</script>
${dismissScript}
</body>
</html>`;
}
