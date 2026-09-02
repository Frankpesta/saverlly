"use client"

import * as React from "react"
import {
  ANNOUNCEMENT_CANVAS_HEIGHT,
  ANNOUNCEMENT_CANVAS_WIDTH,
  layoutElementStyle,
  type AnnouncementLayout,
  type AnnouncementLayoutElement,
} from "@saverlly/shared-types"
import { cn } from "@/lib/utils"

/** Movement smaller than this is a click, not a drag — without it, selecting an element with a
 *  slightly unsteady hand nudges it a pixel or two. */
const DRAG_THRESHOLD_PX = 3
const GRID_PX = 8
const MIN_SIZE_PX = 16

type Handle = "nw" | "ne" | "sw" | "se"

const HANDLES: { id: Handle; cursor: string; left: number; top: number }[] = [
  { id: "nw", cursor: "nwse-resize", left: 0, top: 0 },
  { id: "ne", cursor: "nesw-resize", left: 1, top: 0 },
  { id: "sw", cursor: "nesw-resize", left: 0, top: 1 },
  { id: "se", cursor: "nwse-resize", left: 1, top: 1 },
]

type DragState = {
  pointerId: number
  elementId: string
  handle: Handle | null
  startClientX: number
  startClientY: number
  startBox: { x: number; y: number; width: number; height: number }
  moved: boolean
}

function snap(value: number, enabled: boolean): number {
  return enabled ? Math.round(value / GRID_PX) * GRID_PX : Math.round(value)
}

/**
 * The design surface. Elements are positioned in the fixed toast-card canvas space and the whole
 * stage is CSS-scaled down when the column is too narrow for it, so a layout drawn here lands
 * identically on a 1366×768 kiosk and a 4K screen.
 *
 * Scale is capped at 1: the card is a corner toast, not a screen, and the kiosk shows it at its
 * authored size. Editing it larger than it will ever be displayed would invite designs whose type
 * is unreadable at the size that actually matters.
 *
 * Every element is drawn with `layoutElementStyle` from @saverlly/shared-types — the exact
 * function the kiosk's HTML renderer uses — so the editor cannot drift from what the kiosk
 * displays. Only the selection chrome (outline, handles) is editor-specific, and it's drawn on
 * top rather than by altering the element's own styles.
 */
export function AnnouncementCanvas({
  layout,
  onChange,
  selectedId,
  onSelect,
  snapToGrid = true,
}: {
  layout: AnnouncementLayout
  onChange: (layout: AnnouncementLayout) => void
  selectedId: string | null
  onSelect: (id: string | null) => void
  snapToGrid?: boolean
}) {
  const frameRef = React.useRef<HTMLDivElement>(null)
  const dragRef = React.useRef<DragState | null>(null)
  const [scale, setScale] = React.useState(1)

  // The stage keeps its exact pixel geometry and is scaled to the available width, rather than
  // laying out responsively — responsive reflow would move elements relative to each other and
  // break the "what you see is what the kiosk shows" guarantee.
  React.useEffect(() => {
    const frame = frameRef.current
    if (!frame) return
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width ?? 0
      if (width > 0) setScale(Math.min(1, width / ANNOUNCEMENT_CANVAS_WIDTH))
    })
    observer.observe(frame)
    return () => observer.disconnect()
  }, [])

  function updateElement(id: string, patch: Partial<AnnouncementLayoutElement>) {
    onChange({
      ...layout,
      elements: layout.elements.map((element) =>
        element.id === id ? ({ ...element, ...patch } as AnnouncementLayoutElement) : element,
      ),
    })
  }

  function handlePointerDown(
    event: React.PointerEvent,
    element: AnnouncementLayoutElement,
    handle: Handle | null,
  ) {
    event.preventDefault()
    event.stopPropagation()
    onSelect(element.id)
    ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
    dragRef.current = {
      pointerId: event.pointerId,
      elementId: element.id,
      handle,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startBox: { x: element.x, y: element.y, width: element.width, height: element.height },
      moved: false,
    }
  }

  function handlePointerMove(event: React.PointerEvent) {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return

    // Pointer deltas are in screen pixels; the stage is scaled, so they have to be converted back
    // into canvas space or dragging would run at the wrong speed.
    const dx = (event.clientX - drag.startClientX) / scale
    const dy = (event.clientY - drag.startClientY) / scale
    if (!drag.moved && Math.hypot(dx * scale, dy * scale) < DRAG_THRESHOLD_PX) return
    drag.moved = true

    const { startBox, handle } = drag
    if (handle === null) {
      updateElement(drag.elementId, {
        x: snap(startBox.x + dx, snapToGrid),
        y: snap(startBox.y + dy, snapToGrid),
      })
      return
    }

    // Corner resize: the anchored corner stays put, so dragging a west/north handle moves the
    // origin as well as changing the size.
    const east = handle === "ne" || handle === "se"
    const south = handle === "sw" || handle === "se"
    let { x, y, width, height } = startBox

    if (east) {
      width = Math.max(MIN_SIZE_PX, snap(startBox.width + dx, snapToGrid))
    } else {
      const right = startBox.x + startBox.width
      x = Math.min(right - MIN_SIZE_PX, snap(startBox.x + dx, snapToGrid))
      width = right - x
    }

    if (south) {
      height = Math.max(MIN_SIZE_PX, snap(startBox.height + dy, snapToGrid))
    } else {
      const bottom = startBox.y + startBox.height
      y = Math.min(bottom - MIN_SIZE_PX, snap(startBox.y + dy, snapToGrid))
      height = bottom - y
    }

    updateElement(drag.elementId, { x, y, width, height })
  }

  function handlePointerUp(event: React.PointerEvent) {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    dragRef.current = null
    if ((event.currentTarget as HTMLElement).hasPointerCapture?.(event.pointerId)) {
      ;(event.currentTarget as HTMLElement).releasePointerCapture(event.pointerId)
    }
  }

  function handleKeyDown(event: React.KeyboardEvent, element: AnnouncementLayoutElement) {
    const step = event.shiftKey ? GRID_PX : 1
    const nudge: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    }
    const delta = nudge[event.key]
    if (!delta) return
    event.preventDefault()
    updateElement(element.id, { x: element.x + delta[0], y: element.y + delta[1] })
  }

  return (
    <div
      ref={frameRef}
      className="flex w-full justify-center overflow-hidden rounded-xl border border-black/10 bg-[repeating-conic-gradient(#f4f4f5_0%_25%,#ffffff_0%_50%)] bg-[length:16px_16px] dark:border-white/10 dark:bg-[repeating-conic-gradient(#27272a_0%_25%,#18181b_0%_50%)]"
      style={{ height: ANNOUNCEMENT_CANVAS_HEIGHT * scale }}
      onPointerDown={() => onSelect(null)}
    >
      <div
        data-testid="announcement-stage"
        className="relative origin-top-left"
        style={{
          width: ANNOUNCEMENT_CANVAS_WIDTH,
          height: ANNOUNCEMENT_CANVAS_HEIGHT,
          transform: `scale(${scale})`,
          // A transform doesn't shrink the layout box, so a scaled-down stage would still occupy
          // its full unscaled width and defeat the centering. Pulling the right edge in by the
          // difference makes the box measure what the eye sees.
          marginRight: ANNOUNCEMENT_CANVAS_WIDTH * (scale - 1),
          backgroundColor: layout.background,
        }}
      >
        {layout.elements.map((element) => {
          const selected = element.id === selectedId
          const style = layoutElementStyle(element) as React.CSSProperties
          return (
            <div
              key={element.id}
              role="button"
              tabIndex={0}
              aria-label={describeElement(element)}
              aria-pressed={selected}
              className="cursor-move focus:outline-none"
              style={style}
              onPointerDown={(event) => handlePointerDown(event, element, null)}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onKeyDown={(event) => handleKeyDown(event, element)}
            >
              {element.type === "text" && element.text}
              {element.type === "button" && element.label}
            </div>
          )
        })}

        {/* Selection chrome is drawn after the elements so it always sits on top, and its
            dimensions are divided by the scale so the outline and handles stay the same visual
            thickness no matter how far the stage is zoomed out. */}
        {layout.elements
          .filter((element) => element.id === selectedId)
          .map((element) => (
            <div
              key={`${element.id}-selection`}
              className="pointer-events-none absolute"
              style={{
                left: element.x,
                top: element.y,
                width: element.width,
                height: element.height,
                outline: `${2 / scale}px solid var(--brand-teal)`,
                outlineOffset: `${1 / scale}px`,
              }}
            >
              {HANDLES.map((handle) => (
                <div
                  key={handle.id}
                  role="presentation"
                  className="pointer-events-auto absolute bg-white"
                  style={{
                    width: 10 / scale,
                    height: 10 / scale,
                    border: `${2 / scale}px solid var(--brand-teal)`,
                    borderRadius: 2 / scale,
                    left: handle.left * element.width - 5 / scale,
                    top: handle.top * element.height - 5 / scale,
                    cursor: handle.cursor,
                  }}
                  onPointerDown={(event) => handlePointerDown(event, element, handle.id)}
                  onPointerMove={handlePointerMove}
                  onPointerUp={handlePointerUp}
                />
              ))}
            </div>
          ))}
      </div>
    </div>
  )
}

/** Elements are shapes on a canvas with no inherent text for a screen reader to announce, so
 *  each gets a description built from what it actually is. */
export function describeElement(element: AnnouncementLayoutElement): string {
  switch (element.type) {
    case "text":
      return `Text: ${element.text.slice(0, 40) || "empty"}`
    case "image":
      return "Image"
    case "button":
      return `Button: ${element.label}`
    case "shape":
      return "Shape"
  }
}

/** A compact z-order list of everything on the canvas — the reliable way to reach an element
 *  that's been dragged underneath another one, where clicking would only ever hit the top. */
export function LayerList({
  layout,
  selectedId,
  onSelect,
}: {
  layout: AnnouncementLayout
  selectedId: string | null
  onSelect: (id: string) => void
}) {
  return (
    <ul className="flex flex-col gap-1">
      {[...layout.elements].reverse().map((element) => (
        <li key={element.id}>
          <button
            type="button"
            onClick={() => onSelect(element.id)}
            className={cn(
              "w-full truncate rounded-md px-2 py-1.5 text-left text-sm transition-colors",
              element.id === selectedId
                ? "bg-[var(--brand-teal-tint)] font-medium text-foreground"
                : "text-muted-foreground hover:bg-muted",
            )}
          >
            {describeElement(element)}
          </button>
        </li>
      ))}
    </ul>
  )
}
