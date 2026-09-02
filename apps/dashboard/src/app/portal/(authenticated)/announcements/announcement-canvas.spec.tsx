import * as React from "react"
import { render, screen, fireEvent } from "@testing-library/react"
import { createDefaultLayout, type AnnouncementLayout } from "@saverlly/shared-types"
import { AnnouncementCanvas } from "./announcement-canvas"

/** Drives the canvas as a controlled component the way the form does, so a drag that produces
 *  several updates accumulates instead of each one being applied to the original layout. */
function Harness({ initial }: { initial: AnnouncementLayout }) {
  const [layout, setLayout] = React.useState(initial)
  const [selectedId, setSelectedId] = React.useState<string | null>(null)
  return (
    <>
      <AnnouncementCanvas
        layout={layout}
        onChange={setLayout}
        selectedId={selectedId}
        onSelect={setSelectedId}
      />
      <output data-testid="state">{JSON.stringify(layout.elements.map((e) => [e.x, e.y]))}</output>
    </>
  )
}

function firstText(layout: AnnouncementLayout) {
  return layout.elements.find((element) => element.type === "text")!
}

/**
 * jsdom doesn't implement `PointerEvent`, so `fireEvent.pointerMove(el, { clientX })` silently
 * drops the coordinates — the drag then computes against `undefined` and every position becomes
 * NaN. Building a `MouseEvent` with the pointer event's name keeps clientX/clientY intact (React
 * dispatches on the native event name, so its onPointerDown/Move/Up still fire).
 */
function pointer(
  target: Element,
  type: "pointerdown" | "pointermove" | "pointerup",
  { clientX = 0, clientY = 0, pointerId = 1 } = {},
) {
  const event = new MouseEvent(type, { bubbles: true, cancelable: true, clientX, clientY })
  Object.defineProperty(event, "pointerId", { value: pointerId })
  fireEvent(target, event)
}

describe("AnnouncementCanvas", () => {
  // jsdom reports a zero-width content rect, so the component keeps scale at 1 — which is what
  // makes screen-pixel deltas below equal canvas-pixel deltas.
  const base = createDefaultLayout({ title: "Headline", body: "Body copy" })

  it("selects an element on pointer down", () => {
    render(<Harness initial={base} />)
    const target = screen.getByRole("button", { name: /Text: Headline/ })

    expect(target).toHaveAttribute("aria-pressed", "false")
    pointer(target, "pointerdown", { clientX: 100, clientY: 100 })
    expect(target).toHaveAttribute("aria-pressed", "true")
  })

  it("moves an element by the drag distance", () => {
    render(<Harness initial={base} />)
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

    fireEvent.keyDown(target, { key: "ArrowRight" })
    expect(JSON.parse(screen.getByTestId("state").textContent!)[0][0]).toBe(element.x + 1)

    fireEvent.keyDown(target, { key: "ArrowRight", shiftKey: true })
    expect(JSON.parse(screen.getByTestId("state").textContent!)[0][0]).toBe(element.x + 9)
  })

  // The reported bug: an uploaded image never appeared on the canvas. Its URL is served over
  // plain HTTP by the backend while the dashboard is HTTPS, so the browser blocked it as mixed
  // content — silently, which is why it looked like the insert had simply done nothing.
  it("routes image URLs through the proxy so they aren't mixed-content blocked", () => {
    const withImage: AnnouncementLayout = {
      version: 1,
      background: "#fff",
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
})
