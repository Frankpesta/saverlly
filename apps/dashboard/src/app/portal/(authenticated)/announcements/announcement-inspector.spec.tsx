import * as React from "react"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { createEmptyLayout, type AnnouncementLayout, type AnnouncementLayoutElement } from "@saverlly/shared-types"
import { ElementInspector } from "./announcement-inspector"

function rect(
  id: string,
  box: { x: number; y: number; width: number; height: number },
): AnnouncementLayoutElement {
  return { id, type: "shape", kind: "rectangle", fill: "#000000", radius: 0, ...box }
}

/** Drives the inspector as a controlled component, mirroring how the form owns layout/selection. */
function Harness({
  initial,
  selectedIds,
}: {
  initial: AnnouncementLayout
  selectedIds: string[]
}) {
  const [layout, setLayout] = React.useState(initial)
  const [selection, setSelection] = React.useState(selectedIds)
  // Re-syncs when a test calls `rerender` with a different `selectedIds` prop -- state only
  // takes its *initial* value from props on mount, so without this a rerender would silently
  // keep whatever was selected before.
  React.useEffect(() => setSelection(selectedIds), [selectedIds])
  return (
    <>
      <ElementInspector layout={layout} selectedIds={selection} onChange={setLayout} onSelectionChange={setSelection} />
      <output data-testid="boxes">
        {JSON.stringify(layout.elements.map((e) => ({ id: e.id, x: e.x, y: e.y })))}
      </output>
    </>
  )
}

function boxesFrom() {
  return JSON.parse(screen.getByTestId("boxes").textContent!) as { id: string; x: number; y: number }[]
}

describe("ElementInspector alignment", () => {
  const canvas = createEmptyLayout({ width: 400, height: 600 })

  it("aligns a single selected element to the canvas bounds, not to itself", async () => {
    const user = userEvent.setup()
    const layout: AnnouncementLayout = {
      ...canvas,
      elements: [rect("a", { x: 120, y: 200, width: 40, height: 20 })],
    }
    render(<Harness initial={layout} selectedIds={["a"]} />)

    await user.click(screen.getByRole("button", { name: "Align left" }))
    expect(boxesFrom().find((b) => b.id === "a")!.x).toBe(0)

    await user.click(screen.getByRole("button", { name: "Align right" }))
    expect(boxesFrom().find((b) => b.id === "a")!.x).toBe(400 - 40)

    await user.click(screen.getByRole("button", { name: "Align center horizontally" }))
    expect(boxesFrom().find((b) => b.id === "a")!.x).toBe(Math.round(200 - 20))
  })

  it("aligns two or more selected elements to their own bounding box, not the canvas", async () => {
    const user = userEvent.setup()
    const layout: AnnouncementLayout = {
      ...canvas,
      elements: [
        rect("a", { x: 20, y: 50, width: 40, height: 20 }),
        rect("b", { x: 200, y: 300, width: 60, height: 20 }),
      ],
    }
    render(<Harness initial={layout} selectedIds={["a", "b"]} />)

    // Bounding box left is 20 (from "a"), so aligning left moves "b" to x:20 -- not to the
    // canvas's own left edge (0), which single-element alignment would use instead.
    await user.click(screen.getByRole("button", { name: "Align left" }))
    const boxes = boxesFrom()
    expect(boxes.find((b) => b.id === "a")!.x).toBe(20)
    expect(boxes.find((b) => b.id === "b")!.x).toBe(20)
  })

  it("disables distribute below three elements and distributes centers evenly at three or more", async () => {
    const user = userEvent.setup()
    const layout: AnnouncementLayout = {
      ...canvas,
      elements: [
        rect("a", { x: 0, y: 0, width: 20, height: 20 }),
        rect("b", { x: 55, y: 0, width: 20, height: 20 }),
        rect("c", { x: 300, y: 0, width: 20, height: 20 }),
      ],
    }
    const { rerender } = render(<Harness initial={layout} selectedIds={["a", "b"]} />)
    expect(screen.getByRole("button", { name: "Distribute horizontally" })).toBeDisabled()

    rerender(<Harness initial={layout} selectedIds={["a", "b", "c"]} />)
    expect(screen.getByRole("button", { name: "Distribute horizontally" })).toBeEnabled()

    await user.click(screen.getByRole("button", { name: "Distribute horizontally" }))
    const boxes = boxesFrom()
    // "a" centers at 10, "c" centers at 310 -- "b" should land exactly halfway between them,
    // centered at 160, i.e. x = 160 - 10 = 150. "a" and "c" are the endpoints and don't move.
    expect(boxes.find((b) => b.id === "a")!.x).toBe(0)
    expect(boxes.find((b) => b.id === "c")!.x).toBe(300)
    expect(boxes.find((b) => b.id === "b")!.x).toBe(150)
  })
})
