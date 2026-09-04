import {
  ANNOUNCEMENT_AUTO_DISMISS_MS,
  ANNOUNCEMENT_CANVAS_HEIGHT,
  ANNOUNCEMENT_CANVAS_WIDTH,
  canvasPresetFor,
  createDefaultLayout,
  createEmptyLayout,
  isAnnouncementLayout,
  isFullBleedLayout,
  resizeLayout,
  layoutElementStyle,
  parseAnnouncementLayout,
  renderAnnouncementLayoutHtml,
  styleMapToCssText,
  type AnnouncementLayout,
  type TextLayoutElement,
} from "@saverlly/shared-types"

function layoutWith(element: Record<string, unknown>): unknown {
  return { version: 1, background: "#ffffff", width: 400, height: 520, elements: [element] }
}

describe("parseAnnouncementLayout", () => {
  it("rejects anything that isn't a layout object", () => {
    expect(parseAnnouncementLayout(null)).toBeNull()
    expect(parseAnnouncementLayout("nope")).toBeNull()
    expect(parseAnnouncementLayout([])).toBeNull()
    expect(parseAnnouncementLayout({ version: 1 })).toBeNull()
    expect(isAnnouncementLayout({ version: 1, elements: [] })).toBe(true)
  })

  // A layout is authored by a kiosk owner and rendered as HTML on a kiosk machine, so a
  // javascript:/data: URL surviving the parser would mean script execution on the kiosk.
  it("drops image elements whose URL isn't a plain http(s) one", () => {
    for (const url of [
      "javascript:alert(1)",
      "data:text/html;base64,PHNjcmlwdD4=",
      'https://x.test/a").evil("',
      "file:///C:/Windows/System32",
    ]) {
      const parsed = parseAnnouncementLayout(layoutWith({ type: "image", url }))
      expect(parsed?.elements).toHaveLength(0)
    }

    const ok = parseAnnouncementLayout(layoutWith({ type: "image", url: "https://cdn.test/a.png" }))
    expect(ok?.elements).toHaveLength(1)
  })

  it("falls back to safe values for colours, fonts and sizes instead of passing them through", () => {
    const parsed = parseAnnouncementLayout(
      layoutWith({
        type: "text",
        text: "hi",
        color: "red; background: url(javascript:alert(1))",
        fontFamily: "Comic Sans MS",
        fontSize: 99999,
      }),
    )
    const element = parsed?.elements[0] as TextLayoutElement
    expect(element.color).toBe("#111111")
    // Not a stock Windows font, so the kiosk would have silently substituted something else.
    expect(element.fontFamily).toBe("Segoe UI")
    expect(element.fontSize).toBe(200)
  })

  it("keeps the good elements when only some are broken", () => {
    const parsed = parseAnnouncementLayout({
      version: 1,
      background: "#ffffff",
      elements: [
        { type: "image", url: "javascript:alert(1)" },
        { type: "text", text: "kept" },
      ],
    })
    expect(parsed?.elements).toHaveLength(1)
    expect((parsed?.elements[0] as TextLayoutElement).text).toBe("kept")
  })

  it("caps the element count rather than rendering an unbounded document", () => {
    const elements = Array.from({ length: 200 }, () => ({ type: "text", text: "x" }))
    const parsed = parseAnnouncementLayout({ version: 1, background: "#fff", elements })
    expect(parsed?.elements).toHaveLength(50)
  })
})

// "Clear canvas" has to actually clear it. The renderer used to inject a dismiss button into any
// layout that had none (ensureDismissable), so an emptied canvas silently grew a button back.
describe("createEmptyLayout", () => {
  it("produces a layout with nothing on it", () => {
    expect(createEmptyLayout().elements).toEqual([])
  })

  it("keeps the background and size, which are the frame rather than the content", () => {
    const empty = createEmptyLayout({ background: "#101010", width: 560, height: 320 })
    expect(empty.background).toBe("#101010")
    expect(empty.width).toBe(560)
    expect(empty.height).toBe(320)
  })

  it("renders as an empty card rather than growing a button back", () => {
    const html = renderAnnouncementLayoutHtml(createEmptyLayout())
    expect(html).not.toContain("<button type=\"button\"")
    // The renderer-owned close button is still there: that is what guarantees a way out.
    expect(html).toContain('id="chrome-close"')
  })
})

describe("renderAnnouncementLayoutHtml", () => {
  it("escapes text so markup in a headline renders as characters, not HTML", () => {
    const html = renderAnnouncementLayoutHtml(
      parseAnnouncementLayout(
        layoutWith({ type: "text", text: '<script>alert("xss")</script>' }),
      ) as AnnouncementLayout,
    )
    expect(html).not.toContain("<script>alert")
    expect(html).toContain("&lt;script&gt;")
  })

  it("always produces a dismissable document even from an empty layout", () => {
    const html = renderAnnouncementLayoutHtml(createEmptyLayout())
    expect(html).toContain("data-saverlly-dismiss")
  })

  it("omits the dismiss handler when rendering a non-interactive preview", () => {
    const layout = createDefaultLayout({ title: "t", body: "b" })
    expect(renderAnnouncementLayoutHtml(layout, { interactive: false })).not.toContain(
      "webview.postMessage",
    )
    expect(renderAnnouncementLayoutHtml(layout, { interactive: true })).toContain(
      "webview.postMessage",
    )
  })

  // The whole point of sharing this module: the editor paints elements with layoutElementStyle
  // and the kiosk paints them from the serialized form of the same map. If these two ever
  // disagreed, the preview would be a lie.
  it("renders each element with exactly the styles the editor uses", () => {
    const layout = createDefaultLayout({ title: "Hello", body: "World" })
    const html = renderAnnouncementLayoutHtml(layout)
    for (const element of layout.elements) {
      const css = styleMapToCssText(layoutElementStyle(element))
      // Attribute-escaped in the document, so compare against the escaped form.
      const escaped = css.replace(/"/g, "&quot;").replace(/'/g, "&#39;")
      expect(html).toContain(escaped)
    }
  })
})

// The toast is a corner card, not a screen: the agent sizes its window to these dimensions, so a
// design that assumes screen proportions would be a design nobody can read.
describe("the toast card", () => {
  it("is a portrait card small enough to sit in the corner of a modest kiosk display", () => {
    expect(ANNOUNCEMENT_CANVAS_WIDTH).toBeLessThan(ANNOUNCEMENT_CANVAS_HEIGHT)
    // Comfortably inside the working area of the smallest display we support (1366×768), with
    // room left for the margin the agent adds on both edges.
    expect(ANNOUNCEMENT_CANVAS_WIDTH).toBeLessThanOrEqual(480)
    expect(ANNOUNCEMENT_CANVAS_HEIGHT).toBeLessThanOrEqual(640)
  })

  // Elements are clipped to the stage, so anything the default arrangement puts outside the card
  // simply would not be there on the kiosk.
  it("fits the whole default arrangement inside the card, image or not", () => {
    for (const mediaUrl of [null, "https://cdn.test/a.png"]) {
      for (const element of createDefaultLayout({ title: "Title", body: "Body", mediaUrl })
        .elements) {
        expect(element.x).toBeGreaterThanOrEqual(0)
        expect(element.y).toBeGreaterThanOrEqual(0)
        expect(element.x + element.width).toBeLessThanOrEqual(ANNOUNCEMENT_CANVAS_WIDTH)
        expect(element.y + element.height).toBeLessThanOrEqual(ANNOUNCEMENT_CANVAS_HEIGHT)
      }
    }
  })

  // The chrome × and the timer are the renderer's, not the design's. They are what make a
  // buttonless or misdesigned layout still closeable, so they can't depend on the layout at all.
  it("always draws its own close button, whatever the design contains", () => {
    const html = renderAnnouncementLayoutHtml(createEmptyLayout())
    expect(html).toContain('id="chrome-close"')
    expect(html).toContain("Close announcement")
  })

  it("dismisses itself on a timer when hosted, and never in the editor preview", () => {
    const layout = createDefaultLayout({ title: "t", body: "b" })
    expect(renderAnnouncementLayoutHtml(layout)).toContain(
      `setTimeout(dismiss, ${ANNOUNCEMENT_AUTO_DISMISS_MS})`,
    )
    // A preview that slid itself away 20 seconds into an editing session would look like a bug.
    expect(renderAnnouncementLayoutHtml(layout, { interactive: false })).not.toContain(
      "setTimeout(dismiss",
    )
  })

  it("slides in rather than appearing, and animates without clobbering the fit scale", () => {
    const html = renderAnnouncementLayoutHtml(createDefaultLayout({ title: "t", body: "b" }))
    expect(html).toContain("@keyframes saverlly-rise")
    // The animation drives `translate` and the fit drives `scale`; if either used `transform`
    // they would overwrite one another and the card would jump or vanish.
    expect(html).toContain("scale: var(--fit, 1)")
    expect(html).toMatch(/@keyframes saverlly-rise\s*\{[^}]*translate:/)
  })

  // Upscaling a 400px design to a 1920px screen is exactly what made the old overlay look soft.
  it("never scales the design above its authored size", () => {
    expect(renderAnnouncementLayoutHtml(createDefaultLayout({}))).toMatch(
      /var scale = Math\.min\(\s*1,/,
    )
  })
})

// The dashboard is served over HTTPS; the backend serves uploads over plain HTTP. A raw
// url("http://…") is mixed content, which the browser drops silently. No console error, no
// broken-image icon, the image just isn't there. That is the exact bug this resolver fixes.
describe("resolveImageUrl", () => {
  const withImage = {
    version: 1,
    background: "#fff",
    width: 400,
    height: 520,
    elements: [
      {
        id: "i1",
        type: "image" as const,
        x: 0,
        y: 0,
        width: 100,
        height: 100,
        url: "http://56.228.62.8:3000/uploads/announcements/pic.png",
        fit: "cover" as const,
        radius: 0,
      },
    ],
  }

  it("rewrites image URLs when a resolver is given", () => {
    const style = layoutElementStyle(withImage.elements[0], {
      resolveImageUrl: (url) => `/api/image-proxy?url=${encodeURIComponent(url)}`,
    })
    expect(style.backgroundImage).toContain("/api/image-proxy?url=")
    expect(style.backgroundImage).not.toContain('url("http://56.228.62.8')
  })

  // The kiosk agent has no proxy. It loads images straight from the backend, so it must render
  // the URL exactly as saved. A resolver leaking in as a default would break every kiosk.
  it("leaves the URL exactly as saved when no resolver is given", () => {
    expect(layoutElementStyle(withImage.elements[0]).backgroundImage).toBe(
      'url("http://56.228.62.8:3000/uploads/announcements/pic.png")',
    )
    expect(renderAnnouncementLayoutHtml(withImage)).toContain(
      "http://56.228.62.8:3000/uploads/announcements/pic.png",
    )
  })

  it("threads the resolver through the HTML renderer the preview uses", () => {
    const html = renderAnnouncementLayoutHtml(withImage, {
      interactive: false,
      resolveImageUrl: () => "https://dash.test/api/image-proxy?url=x",
    })
    expect(html).toContain("https://dash.test/api/image-proxy?url=x")
    expect(html).not.toContain("56.228.62.8")
  })

  it("only touches images, never a text or button element", () => {
    const shout = jest.fn((url: string) => `proxied:${url}`)
    const layout = createDefaultLayout({ title: "t", body: "b" })
    renderAnnouncementLayoutHtml(layout, { resolveImageUrl: shout })
    expect(shout).not.toHaveBeenCalled()
  })
})

describe("createDefaultLayout", () => {
  it("includes the image only when there is a usable one", () => {
    expect(createDefaultLayout({ title: "t", body: "b" }).elements.some((e) => e.type === "image")).toBe(
      false,
    )
    expect(
      createDefaultLayout({ title: "t", body: "b", mediaUrl: "https://cdn.test/a.png" }).elements.some(
        (e) => e.type === "image",
      ),
    ).toBe(true)
    // A stored mediaUrl that isn't renderable must not create an empty hole in the design.
    expect(
      createDefaultLayout({ title: "t", body: "b", mediaUrl: "javascript:alert(1)" }).elements.some(
        (e) => e.type === "image",
      ),
    ).toBe(false)
  })
})

// Shapes had no discriminator at all: only `fill` and `radius`, so the single way to get a
// circle was cranking the radius to 999 on a square, and lines and triangles were unreachable.
describe("shape kinds", () => {
  function shape(kind: string) {
    return parseAnnouncementLayout(
      layoutWith({ type: "shape", kind, fill: "#ff0000", width: 100, height: 20 }),
    )!.elements[0]
  }

  it("defaults an unknown or missing kind to a rectangle, so old shapes look unchanged", () => {
    expect(shape("hexagon")).toMatchObject({ kind: "rectangle" })
    const legacy = parseAnnouncementLayout(layoutWith({ type: "shape", fill: "#ff0000" }))!
    expect(legacy.elements[0]).toMatchObject({ kind: "rectangle" })
  })

  it("draws an ellipse as a fully rounded box", () => {
    expect(layoutElementStyle(shape("ellipse")).borderRadius).toBe("50%")
  })

  it("caps a line to its own thickness rather than a corner radius", () => {
    expect(layoutElementStyle(shape("line")).borderRadius).toBe("10px")
  })

  it("clips a triangle to its points, so its box still matches the selection outline", () => {
    expect(layoutElementStyle(shape("triangle")).clipPath).toBe("polygon(50% 0%, 100% 100%, 0% 100%)")
  })
})

// Every button used to be stamped with data-saverlly-dismiss regardless of what it said, so the
// only editable thing about one was its label.
describe("click actions", () => {
  function button(action: unknown) {
    return parseAnnouncementLayout(
      layoutWith({ type: "button", label: "Go", action }),
    )!.elements[0]
  }

  it("defaults a button with no action to dismiss, preserving how old layouts behaved", () => {
    expect(button(undefined)).toMatchObject({ action: { type: "dismiss" } })
  })

  it("keeps a URL action and renders it as something the host can open", () => {
    const element = button({ type: "url", href: "https://saverlly.com/deal" })
    expect(element).toMatchObject({ action: { type: "url", href: "https://saverlly.com/deal" } })
    const html = renderAnnouncementLayoutHtml({
      version: 1,
      background: "#fff",
      width: 400,
      height: 520,
      elements: [element],
    })
    expect(html).toContain('data-saverlly-open="https://saverlly.com/deal"')
    expect(html).toContain("saverlly:open:")
  })

  it("turns an email action into a mailto", () => {
    const element = button({ type: "email", address: "hi@saverlly.com" })
    const html = renderAnnouncementLayoutHtml({
      version: 1,
      background: "#fff",
      width: 400,
      height: 520,
      elements: [element],
    })
    expect(html).toContain('data-saverlly-open="mailto:hi@saverlly.com"')
  })

  // A layout is authored by a kiosk owner and rendered as HTML on a kiosk machine, so an unsafe
  // scheme surviving would mean script execution on the kiosk.
  it("falls back to dismiss rather than emitting an unsafe or broken link", () => {
    for (const href of ["javascript:alert(1)", "data:text/html,x", "not-a-url", "/relative"]) {
      expect(button({ type: "url", href })).toMatchObject({ action: { type: "dismiss" } })
    }
    expect(button({ type: "email", address: "not an address" })).toMatchObject({
      action: { type: "dismiss" },
    })
  })

  it("leaves text unlinked unless an action is set, and renders a linked run as an anchor", () => {
    const plain = parseAnnouncementLayout(layoutWith({ type: "text", text: "hi" }))!.elements[0]
    expect(plain).toMatchObject({ action: null })

    const linked = parseAnnouncementLayout(
      layoutWith({ type: "text", text: "Shop now", action: { type: "url", href: "https://a.test/x" } }),
    )!.elements[0]
    const html = renderAnnouncementLayoutHtml({
      version: 1,
      background: "#fff",
      width: 400,
      height: 520,
      elements: [linked],
    })
    expect(html).toContain('<a href="https://a.test/x"')
    expect(html).toContain('data-saverlly-open="https://a.test/x"')
  })
})

// "How do I change the doc size from vertical to horizontal" had no answer while the canvas was
// two compile-time constants.
describe("canvas size", () => {
  it("defaults a layout with no dimensions to the portrait toast it was authored against", () => {
    const parsed = parseAnnouncementLayout({ version: 1, background: "#fff", elements: [] })!
    expect(parsed.width).toBe(ANNOUNCEMENT_CANVAS_WIDTH)
    expect(parsed.height).toBe(ANNOUNCEMENT_CANVAS_HEIGHT)
  })

  it("names the matching preset, and reports a custom size as no preset", () => {
    expect(canvasPresetFor({ width: 400, height: 520 })?.id).toBe("portrait")
    expect(canvasPresetFor({ width: 560, height: 320 })?.id).toBe("landscape")
    expect(canvasPresetFor({ width: 123, height: 456 })).toBeNull()
  })

  it("marks only the full-screen preset as filling the display", () => {
    expect(isFullBleedLayout({ width: 1280, height: 720 })).toBe(true)
    expect(isFullBleedLayout({ width: 400, height: 520 })).toBe(false)
  })

  it("sizes the rendered document to the layout rather than to the constants", () => {
    const html = renderAnnouncementLayoutHtml(createEmptyLayout({ width: 560, height: 320 }))
    expect(html).toContain("width: 560px")
    expect(html).toContain("height: 320px")
  })

  // Resizing without rescaling would leave half the design off the new right edge.
  it("rescales and re-centres the design when the canvas changes", () => {
    const portrait = createDefaultLayout({ title: "Title", body: "Body" })
    const landscape = resizeLayout(portrait, 560, 320)

    expect(landscape.width).toBe(560)
    expect(landscape.height).toBe(320)
    for (const element of landscape.elements) {
      expect(element.x).toBeGreaterThanOrEqual(0)
      expect(element.y).toBeGreaterThanOrEqual(0)
      expect(element.x + element.width).toBeLessThanOrEqual(560)
      expect(element.y + element.height).toBeLessThanOrEqual(320)
    }
  })

  it("scales type with the canvas, so a headline stays a headline", () => {
    const portrait = createDefaultLayout({ title: "Title" })
    const headline = portrait.elements.find((e) => e.type === "text")!
    const bigger = resizeLayout(portrait, 1280, 720)
    const scaled = bigger.elements.find((e) => e.type === "text")!
    expect(scaled.type === "text" && headline.type === "text").toBe(true)
    if (scaled.type === "text" && headline.type === "text") {
      expect(scaled.fontSize).toBeGreaterThan(headline.fontSize)
    }
  })

  it("is a no-op when the size hasn't changed", () => {
    const layout = createDefaultLayout({ title: "t" })
    expect(resizeLayout(layout, layout.width, layout.height)).toBe(layout)
  })
})
