import * as React from "react"
import { render, screen, fireEvent } from "@testing-library/react"
import { createDefaultLayout, type AnnouncementLayout } from "@saverlly/shared-types"
import { AnnouncementCanvas } from "./announcement-canvas"

/** Drives the canvas as a controlled component the way the form does, so a drag that produces
 *  several updates accumulates instead of each one being applied to the original layout. */
function Harness({
  initial,
  snapToGrid,
}: {
  initial: AnnouncementLayout
  /** Defaults to the component's own default (on). Tests that only care about the raw drag
   *  distance pass `false` so neither grid- nor element-snapping perturbs the expected math. */
  snapToGrid?: boolean
}) {
  const [layout, setLayout] = React.useState(initial)
  const [selectedIds, setSelectedIds] = React.useState<string[]>([])
  return (
    <>
      <AnnouncementCanvas
        layout={layout}
        onChange={setLayout}
        selectedIds={selectedIds}
        onSelectionChange={setSelectedIds}
        snapToGrid={snapToGrid}
      />
      <output data-testid="state">{JSON.stringify(layout.elements.map((e) => [e.x, e.y]))}</output>
      <output data-testid="count">{layout.elements.length}</output>
      <output data-testid="selected">{selectedIds.length === 0 ? "none" : selectedIds.join(",")}</output>
    </>
  )
}

function firstText(layout: AnnouncementLayout) {
  return layout.elements.find((element) => element.type === "text")!
}

function secondText(layout: AnnouncementLayout) {
  return layout.elements.filter((element) => element.type === "text")[1]!
}

/**
 * jsdom doesn't implement `PointerEvent`, so `fireEvent.pointerMove(el, { clientX })` silently
 * drops the coordinates. The drag then computes against `undefined` and every position becomes
 * NaN. Building a `MouseEvent` with the pointer event's name keeps clientX/clientY intact (React
 * dispatches on the native event name, so its onPointerDown/Move/Up still fire).
 */
function pointer(
  target: Element,
  type: "pointerdown" | "pointermove" | "pointerup",
  { clientX = 0, clientY = 0, pointerId = 1, shiftKey = false } = {},
) {
  const event = new MouseEvent(type, { bubbles: true, cancelable: true, clientX, clientY, shiftKey })
  Object.defineProperty(event, "pointerId", { value: pointerId })
  fireEvent(target, event)
}

describe("AnnouncementCanvas", () => {
  // jsdom reports a zero-width content rect, so the component keeps scale at 1. Which is what
  // makes screen-pixel deltas below equal canvas-pixel deltas.
  const base = createDefaultLayout({ title: "Headline", body: "Body copy" })

  // The keyboard handler only ever handled arrow keys, so deleting meant hunting for the bin
  // icon in the inspector every time.
  describe("keyboard shortcuts on the selection", () => {
    it("deletes on Delete and on Backspace", () => {
      for (const key of ["Delete", "Backspace"]) {
        const { unmount } = render(<Harness initial={base} />)
        const before = Number(screen.getByTestId("count").textContent)
        const target = screen.getByRole("button", { name: /Text: Headline/ })

        pointer(target, "pointerdown", { clientX: 100, clientY: 100 })
        fireEvent.keyDown(target, { key })

        expect(Number(screen.getByTestId("count").textContent)).toBe(before - 1)
        expect(screen.getByTestId("selected")).toHaveTextContent("none")
        unmount()
      }
    })

    it("duplicates on Ctrl+D, offset so the copy is visible", () => {
      render(<Harness initial={base} />)
      const before = Number(screen.getByTestId("count").textContent)
      const element = firstText(base)
      const target = screen.getByRole("button", { name: /Text: Headline/ })

      pointer(target, "pointerdown", { clientX: 100, clientY: 100 })
      fireEvent.keyDown(target, { key: "d", ctrlKey: true })

      const positions = JSON.parse(screen.getByTestId("state").textContent!)
      expect(Number(screen.getByTestId("count").textContent)).toBe(before + 1)
      expect(positions[positions.length - 1]).toEqual([element.x + 16, element.y + 16])
    })

    it("deselects on Escape", () => {
      render(<Harness initial={base} />)
      const target = screen.getByRole("button", { name: /Text: Headline/ })

      pointer(target, "pointerdown", { clientX: 100, clientY: 100 })
      expect(screen.getByTestId("selected")).not.toHaveTextContent("none")

      fireEvent.keyDown(target, { key: "Escape" })
      expect(screen.getByTestId("selected")).toHaveTextContent("none")
    })
  })

  // Canvas size lives on the layout now, so the stage has to follow it rather than the old
  // portrait constants.
  it("sizes the stage from the layout, not from a fixed constant", () => {
    render(<Harness initial={{ ...base, width: 560, height: 320 }} />)
    const stage = screen.getByTestId("announcement-stage")
    expect(stage).toHaveStyle({ width: "560px", height: "320px" })
  })

  it("selects an element on pointer down", () => {
    render(<Harness initial={base} />)
    const target = screen.getByRole("button", { name: /Text: Headline/ })

    expect(target).toHaveAttribute("aria-pressed", "false")
    pointer(target, "pointerdown", { clientX: 100, clientY: 100 })
    expect(target).toHaveAttribute("aria-pressed", "true")
  })

  it("moves an element by the drag distance", () => {
    // Snapping off: this checks the raw drag-distance math, not whether a nearby edge on one of
    // createDefaultLayout's other elements happens to pull it off by a few pixels.
    render(<Harness initial={base} snapToGrid={false} />)
    const element = firstText(base)
    const target = screen.getByRole("button", { name: /Text: Headline/ })

    pointer(target, "pointerdown", { clientX: 100, clientY: 100 })
    pointer(target, "pointermove", { clientX: 180, clientY: 140 })
    pointer(target, "pointerup")

    const [[x, y]] = JSON.parse(screen.getByTestId("state").textContent!)
    expect(x).toBe(element.x + 80)
    expect(y).toBe(element.y + 40)
  })

  it("ignores movement below the drag threshold so a click doesn't nudge", () => {
    render(<Harness initial={base} />)
    const before = JSON.parse(
      JSON.stringify(base.elements.map((e) => [e.x, e.y])),
    )
    const target = screen.getByRole("button", { name: /Text: Headline/ })

    pointer(target, "pointerdown", { clientX: 100, clientY: 100 })
    pointer(target, "pointermove", { clientX: 101, clientY: 101 })
    pointer(target, "pointerup")

    expect(JSON.parse(screen.getByTestId("state").textContent!)).toEqual(before)
  })

  it("nudges with the arrow keys, a grid step at a time when shift is held", () => {
    render(<Harness initial={base} />)
    const element = firstText(base)
    const target = screen.getByRole("button", { name: /Text: Headline/ })

    // Selected first, which is what a real interaction always does. This used to fire the
    // keydown at an unselected element, which only worked because each element carried its own
    // handler. In a browser that handler never ran at all: pointerdown calls preventDefault, so
    // the element never took focus and the keystroke went elsewhere entirely.
    pointer(target, "pointerdown", { clientX: 100, clientY: 100 })

    fireEvent.keyDown(target, { key: "ArrowRight" })
    expect(JSON.parse(screen.getByTestId("state").textContent!)[0][0]).toBe(element.x + 1)

    fireEvent.keyDown(target, { key: "ArrowRight", shiftKey: true })
    expect(JSON.parse(screen.getByTestId("state").textContent!)[0][0]).toBe(element.x + 9)
  })

  // The stage owns the shortcuts, so they have to survive the pointer landing on a resize handle
  // rather than on the element's own box.
  it("keeps the shortcuts working after grabbing a resize handle", () => {
    render(<Harness initial={base} />)
    const element = firstText(base)
    const target = screen.getByRole("button", { name: /Text: Headline/ })

    pointer(target, "pointerdown", { clientX: 100, clientY: 100 })
    const handle = document.querySelectorAll('[role="presentation"]')[0]
    pointer(handle, "pointerdown", { clientX: 100, clientY: 100 })
    pointer(handle, "pointerup")

    fireEvent.keyDown(screen.getByTestId("announcement-stage"), { key: "ArrowRight" })
    expect(JSON.parse(screen.getByTestId("state").textContent!)[0][0]).toBe(element.x + 1)
  })

  // The reported bug: an uploaded image never appeared on the canvas. Its URL is served over
  // plain HTTP by the backend while the dashboard is HTTPS, so the browser blocked it as mixed
  // content. Silently, which is why it looked like the insert had simply done nothing.
  it("routes image URLs through the proxy so they aren't mixed-content blocked", () => {
    const withImage: AnnouncementLayout = {
      version: 1,
      background: "#fff",
      width: 400,
      height: 520,
      elements: [
        {
          id: "img-1",
          type: "image",
          x: 10,
          y: 10,
          width: 120,
          height: 80,
          url: "http://56.228.62.8:3000/uploads/announcements/pic.png",
          fit: "cover",
          radius: 0,
        },
      ],
    }
    render(<Harness initial={withImage} />)

    const image = screen.getByRole("button", { name: /Image/ })
    expect(image).toHaveStyle({
      backgroundImage: `url("/api/image-proxy?url=${encodeURIComponent(
        "http://56.228.62.8:3000/uploads/announcements/pic.png",
      )}")`,
    })
  })

  it("deselects when the surrounding frame is clicked", () => {
    render(<Harness initial={base} />)
    const target = screen.getByRole("button", { name: /Text: Headline/ })

    pointer(target, "pointerdown", { clientX: 100, clientY: 100 })
    expect(target).toHaveAttribute("aria-pressed", "true")

    pointer(screen.getByTestId("announcement-stage").parentElement!, "pointerdown")
    expect(target).toHaveAttribute("aria-pressed", "false")
  })

  describe("element-to-element snapping", () => {
    const twoRects: AnnouncementLayout = {
      version: 1,
      background: "#fff",
      width: 400,
      height: 400,
      elements: [
        { id: "s1", type: "shape", kind: "rectangle", fill: "#000000", radius: 0, x: 0, y: 0, width: 40, height: 40 },
        { id: "s2", type: "shape", kind: "triangle", fill: "#000000", radius: 0, x: 200, y: 100, width: 40, height: 40 },
      ],
    }

    it("pulls a dragged element's edge onto another element's edge once it's within range, and shows a guide", () => {
      render(<Harness initial={twoRects} />)
      const target = screen.getByRole("button", { name: "Triangle" })

      pointer(target, "pointerdown", { clientX: 200, clientY: 100 })
      // s1's right edge is at x:40. Landing s2's left edge at x:43 -- 3px short, well inside the
      // 6px snap threshold -- should pull it the rest of the way to land exactly on it.
      pointer(target, "pointermove", { clientX: 43, clientY: 100 })

      expect(screen.getByTestId("snap-guide-x")).toBeInTheDocument()

      pointer(target, "pointerup")
      expect(screen.queryByTestId("snap-guide-x")).not.toBeInTheDocument()
      const positions = JSON.parse(screen.getByTestId("state").textContent!)
      expect(positions[1][0]).toBe(40)
    })

    it("does not snap, and grid-snaps instead, when nothing is within range", () => {
      render(<Harness initial={twoRects} />)
      const target = screen.getByRole("button", { name: "Triangle" })

      pointer(target, "pointerdown", { clientX: 200, clientY: 100 })
      // Far from any edge of s1 on either axis -- ordinary grid-snap applies instead.
      pointer(target, "pointermove", { clientX: 210, clientY: 100 })

      expect(screen.queryByTestId("snap-guide-x")).not.toBeInTheDocument()
      const positions = JSON.parse(screen.getByTestId("state").textContent!)
      expect(positions[1][0]).toBe(208) // 200 + 10, rounded to the nearest 8px grid step
    })

    it("is disabled entirely when snapToGrid is off", () => {
      render(<Harness initial={twoRects} snapToGrid={false} />)
      const target = screen.getByRole("button", { name: "Triangle" })

      pointer(target, "pointerdown", { clientX: 200, clientY: 100 })
      pointer(target, "pointermove", { clientX: 43, clientY: 100 })

      expect(screen.queryByTestId("snap-guide-x")).not.toBeInTheDocument()
      const positions = JSON.parse(screen.getByTestId("state").textContent!)
      expect(positions[1][0]).toBe(43)
    })
  })

  describe("multi-select", () => {
    it("shift-clicking a second element adds it to the selection instead of replacing it", () => {
      render(<Harness initial={base} />)
      const first = screen.getByRole("button", { name: /Text: Headline/ })
      const second = screen.getByRole("button", { name: /Text: Body copy/ })

      pointer(first, "pointerdown", { clientX: 100, clientY: 100 })
      pointer(second, "pointerdown", { clientX: 100, clientY: 200, shiftKey: true })

      expect(first).toHaveAttribute("aria-pressed", "true")
      expect(second).toHaveAttribute("aria-pressed", "true")
    })

    it("shift-clicking an already-selected element removes just that one", () => {
      render(<Harness initial={base} />)
      const first = screen.getByRole("button", { name: /Text: Headline/ })
      const second = screen.getByRole("button", { name: /Text: Body copy/ })

      pointer(first, "pointerdown", { clientX: 100, clientY: 100 })
      pointer(second, "pointerdown", { clientX: 100, clientY: 200, shiftKey: true })
      pointer(second, "pointerdown", { clientX: 100, clientY: 200, shiftKey: true })

      expect(first).toHaveAttribute("aria-pressed", "true")
      expect(second).toHaveAttribute("aria-pressed", "false")
    })

    it("a plain drag on any member of a multi-selection moves the whole group together", () => {
      render(<Harness initial={base} />)
      const first = firstText(base)
      const second = secondText(base)
      const firstEl = screen.getByRole("button", { name: /Text: Headline/ })
      const secondEl = screen.getByRole("button", { name: /Text: Body copy/ })

      pointer(firstEl, "pointerdown", { clientX: 100, clientY: 100 })
      pointer(secondEl, "pointerdown", { clientX: 100, clientY: 200, shiftKey: true })

      // Dragging from the second (already-selected) element moves both by the same delta.
      // 48/64 rather than a round number: both are exact multiples of the 8px snap grid, so the
      // default grid-snapping doesn't distort the expected offset.
      pointer(secondEl, "pointerdown", { clientX: 100, clientY: 200 })
      pointer(secondEl, "pointermove", { clientX: 148, clientY: 264 })
      pointer(secondEl, "pointerup")

      const positions = JSON.parse(screen.getByTestId("state").textContent!)
      const firstIndex = base.elements.findIndex((e) => e.id === first.id)
      const secondIndex = base.elements.findIndex((e) => e.id === second.id)
      expect(positions[firstIndex]).toEqual([first.x + 48, first.y + 64])
      expect(positions[secondIndex]).toEqual([second.x + 48, second.y + 64])
    })

    it("a marquee drag from empty canvas selects everything it overlaps on release", () => {
      render(<Harness initial={base} />)
      const stage = screen.getByTestId("announcement-stage")
      const first = firstText(base)
      const second = secondText(base)

      // A box wide enough to cover both text elements' canvas-space positions (jsdom reports a
      // zero-offset bounding rect, so client coordinates equal canvas coordinates here).
      const left = Math.min(first.x, second.x) - 5
      const top = Math.min(first.y, second.y) - 5
      const right = Math.max(first.x + first.width, second.x + second.width) + 5
      const bottom = Math.max(first.y + first.height, second.y + second.height) + 5

      pointer(stage, "pointerdown", { clientX: left, clientY: top })
      pointer(stage, "pointermove", { clientX: right, clientY: bottom })
      pointer(stage, "pointerup")

      expect(screen.getByTestId("selected").textContent).toEqual(
        expect.stringContaining(first.id),
      )
      expect(screen.getByTestId("selected").textContent).toEqual(
        expect.stringContaining(second.id),
      )
    })

    it("deleting a multi-selection removes every selected element at once", () => {
      render(<Harness initial={base} />)
      const before = Number(screen.getByTestId("count").textContent)
      const first = screen.getByRole("button", { name: /Text: Headline/ })
      const second = screen.getByRole("button", { name: /Text: Body copy/ })

      pointer(first, "pointerdown", { clientX: 100, clientY: 100 })
      pointer(second, "pointerdown", { clientX: 100, clientY: 200, shiftKey: true })
      fireEvent.keyDown(second, { key: "Delete" })

      expect(Number(screen.getByTestId("count").textContent)).toBe(before - 2)
      expect(screen.getByTestId("selected")).toHaveTextContent("none")
    })
  })
})
