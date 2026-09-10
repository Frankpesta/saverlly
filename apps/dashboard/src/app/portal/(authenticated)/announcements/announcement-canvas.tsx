"use client"

import * as React from "react"
import {
  createElementId,
  layoutElementStyle,
  type AnnouncementLayout,
  type AnnouncementLayoutElement,
} from "@saverlly/shared-types"
import { cn } from "@/lib/utils"
import { proxiedImageUrl } from "@/lib/image-proxy"

/** Image elements are drawn from the backend's own upload storage, which is served over plain
 *  HTTP while the dashboard is on HTTPS, a raw `url("http://…")` is mixed content and the
 *  browser drops it silently, so an uploaded image would simply never appear on the canvas.
 *  Only the URL is rewritten; every other style still comes from the shared definition. */
const CANVAS_STYLE_OPTIONS = { resolveImageUrl: proxiedImageUrl }

/** Movement smaller than this is a click, not a drag. Without it, selecting an element with a
 *  slightly unsteady hand nudges it a pixel or two. */
const DRAG_THRESHOLD_PX = 3
const GRID_PX = 8
const MIN_SIZE_PX = 16
/** How close (in canvas-space pixels) the dragged box's edges/center have to land to another
 *  element's before it snaps. Deliberately smaller than GRID_PX: this only fires for a genuinely
 *  close pass, not merely because the grid happened to land nearby. */
const ELEMENT_SNAP_PX = 6

type Handle = "nw" | "ne" | "sw" | "se"
type Box = { x: number; y: number; width: number; height: number }

const HANDLES: { id: Handle; cursor: string; left: number; top: number }[] = [
  { id: "nw", cursor: "nwse-resize", left: 0, top: 0 },
  { id: "ne", cursor: "nesw-resize", left: 1, top: 0 },
  { id: "sw", cursor: "nesw-resize", left: 0, top: 1 },
  { id: "se", cursor: "nwse-resize", left: 1, top: 1 },
]

/**
 * One pointer gesture on the canvas is exactly one of these three things, decided at
 * pointerdown: dragging a resize handle, moving one or more selected elements, or drawing a
 * marquee over empty canvas. `moved` gates the click-vs-drag distinction the same way for all
 * three, so a steady click never nudges an element or clears a selection it didn't mean to.
 */
type DragState =
  | {
      kind: "resize"
      pointerId: number
      elementId: string
      handle: Handle
      startClientX: number
      startClientY: number
      startBox: Box
      moved: boolean
    }
  | {
      kind: "move"
      pointerId: number
      elementIds: string[]
      /** The element actually grabbed to start the drag, which may be one of several in a
       *  multi-selection. Its box (not the group's as a whole) is what's tested against other
       *  elements' edges for snapping -- the piece the pointer is on is the one whose alignment
       *  the owner is actually watching. */
      grabbedId: string
      startClientX: number
      startClientY: number
      startBoxes: Record<string, Box>
      moved: boolean
    }
  | {
      kind: "marquee"
      pointerId: number
      additive: boolean
      startClientX: number
      startClientY: number
      moved: boolean
    }

function snap(value: number, enabled: boolean): number {
  return enabled ? Math.round(value / GRID_PX) * GRID_PX : Math.round(value)
}

function boxesIntersect(a: Box, b: Box): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y
}

/**
 * Smart-guide snapping: the closest match (within `ELEMENT_SNAP_PX`) between `box`'s own
 * left/center/right against every other element's left/center/right, independently for each
 * axis. Returns how far to nudge `box` on each axis to land exactly on the match, and the
 * canvas-space position of the line to draw as feedback -- null on an axis with no close match,
 * which is also the signal to fall back to grid-snap instead.
 */
function computeElementSnap(
  box: Box,
  others: Box[],
): { dx: number; dy: number; guideX: number | null; guideY: number | null } {
  const xPoints = [box.x, box.x + box.width / 2, box.x + box.width]
  const yPoints = [box.y, box.y + box.height / 2, box.y + box.height]

  let bestDx = 0
  let guideX: number | null = null
  let closestX = ELEMENT_SNAP_PX
  let bestDy = 0
  let guideY: number | null = null
  let closestY = ELEMENT_SNAP_PX

  for (const other of others) {
    for (const otherX of [other.x, other.x + other.width / 2, other.x + other.width]) {
      for (const point of xPoints) {
        const distance = Math.abs(point - otherX)
        if (distance < closestX) {
          closestX = distance
          bestDx = otherX - point
          guideX = otherX
        }
      }
    }
    for (const otherY of [other.y, other.y + other.height / 2, other.y + other.height]) {
      for (const point of yPoints) {
        const distance = Math.abs(point - otherY)
        if (distance < closestY) {
          closestY = distance
          bestDy = otherY - point
          guideY = otherY
        }
      }
    }
  }

  return { dx: bestDx, dy: bestDy, guideX, guideY }
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
 * Every element is drawn with `layoutElementStyle` from @saverlly/shared-types. The exact
 * function the kiosk's HTML renderer uses. So the editor cannot drift from what the kiosk
 * displays. Only the selection chrome (outline, handles) is editor-specific, and it's drawn on
 * top rather than by altering the element's own styles.
 *
 * Selection is a set, not a single id: shift-click toggles an element in or out of it, and
 * dragging from empty canvas draws a marquee that selects everything it overlaps on release.
 * Resize handles only ever appear for a single selected element -- resizing a group by its
 * bounding box is a different, more ambiguous operation this doesn't attempt -- but a plain drag
 * on any member of a multi-element selection moves the whole group together.
 */
export function AnnouncementCanvas({
  layout,
  onChange,
  selectedIds,
  onSelectionChange,
  snapToGrid = true,
}: {
  layout: AnnouncementLayout
  onChange: (layout: AnnouncementLayout) => void
  selectedIds: string[]
  onSelectionChange: (ids: string[]) => void
  snapToGrid?: boolean
}) {
  const frameRef = React.useRef<HTMLDivElement>(null)
  const stageRef = React.useRef<HTMLDivElement>(null)
  const dragRef = React.useRef<DragState | null>(null)
  const [scale, setScale] = React.useState(1)
  const [marqueeBox, setMarqueeBox] = React.useState<Box | null>(null)
  const [snapGuides, setSnapGuides] = React.useState<{ x: number | null; y: number | null }>({
    x: null,
    y: null,
  })
  // Read from the layout, not from constants: the owner picks portrait, landscape or full screen.
  const canvasWidth = layout.width
  const canvasHeight = layout.height

  // The stage keeps its exact pixel geometry and is scaled to the available width, rather than
  // laying out responsively. Responsive reflow would move elements relative to each other and
  // break the "what you see is what the kiosk shows" guarantee.
  //
  // useLayoutEffect and a synchronous first read, not just the ResizeObserver: the observer's
  // callback is async, so on a plain useEffect the browser could paint one frame with the new
  // canvasHeight (from the layout that just changed) alongside the *previous* orientation's scale
  // -- most visible switching portrait to landscape, where the stale, larger scale used to hang
  // the design partway off the frame for a beat before the observer caught up.
  React.useLayoutEffect(() => {
    const frame = frameRef.current
    if (!frame) return
    const width = frame.getBoundingClientRect().width
    if (width > 0) setScale(Math.min(1, width / canvasWidth))
    const observer = new ResizeObserver((entries) => {
      const observedWidth = entries[0]?.contentRect.width ?? 0
      if (observedWidth > 0) setScale(Math.min(1, observedWidth / canvasWidth))
    })
    observer.observe(frame)
    return () => observer.disconnect()
    // Re-measured when the owner switches canvas size, or a 1280px full-screen design would
    // keep being scaled against the 400px portrait width.
  }, [canvasWidth])

  function updateElement(id: string, patch: Partial<AnnouncementLayoutElement>) {
    onChange({
      ...layout,
      elements: layout.elements.map((element) =>
        element.id === id ? ({ ...element, ...patch } as AnnouncementLayoutElement) : element,
      ),
    })
  }

  /** Applies a different patch per element in one `onChange` call, so a group move produces one
   *  layout update instead of each member clobbering the last with a stale `layout` closure. */
  function updateElements(patches: Map<string, Partial<AnnouncementLayoutElement>>) {
    if (patches.size === 0) return
    onChange({
      ...layout,
      elements: layout.elements.map((element) =>
        patches.has(element.id)
          ? ({ ...element, ...patches.get(element.id) } as AnnouncementLayoutElement)
          : element,
      ),
    })
  }

  /** Canvas-space coordinates for a client point, accounting for the stage's own position and
   *  its scale-down transform. Used only by the marquee, which (unlike drag/resize) needs an
   *  absolute position rather than a delta from its own start point. */
  function clientToCanvas(clientX: number, clientY: number) {
    const rect = stageRef.current?.getBoundingClientRect()
    if (!rect) return { x: 0, y: 0 }
    return { x: (clientX - rect.left) / scale, y: (clientY - rect.top) / scale }
  }

  function handleElementPointerDown(
    event: React.PointerEvent,
    element: AnnouncementLayoutElement,
    handle: Handle | null,
  ) {
    event.preventDefault()
    event.stopPropagation()
    // preventDefault above suppresses the browser's own focus-on-mousedown, so without this the
    // stage never holds focus and every keyboard shortcut below (nudge, delete, duplicate) goes
    // to whatever was focused before. Which is why arrow-key nudging did nothing in a real
    // browser despite passing in jsdom, where fireEvent dispatches straight at the element.
    stageRef.current?.focus()
    ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)

    if (handle) {
      // A resize handle only ever renders when exactly one element is selected (see the render
      // below), so this never needs to reconcile with an existing multi-selection.
      onSelectionChange([element.id])
      dragRef.current = {
        kind: "resize",
        pointerId: event.pointerId,
        elementId: element.id,
        handle,
        startClientX: event.clientX,
        startClientY: event.clientY,
        startBox: { x: element.x, y: element.y, width: element.width, height: element.height },
        moved: false,
      }
      return
    }

    if (event.shiftKey) {
      // Shift-click only ever toggles membership. It doesn't also start a drag, so building up a
      // group click by click never drags the last-added member somewhere by accident.
      onSelectionChange(
        selectedIds.includes(element.id)
          ? selectedIds.filter((id) => id !== element.id)
          : [...selectedIds, element.id],
      )
      return
    }

    // A plain click on a member of an existing multi-selection moves the whole group; anything
    // else (an unselected element, or a single existing selection) replaces the selection with
    // just this element first.
    const activeIds =
      selectedIds.length > 1 && selectedIds.includes(element.id) ? selectedIds : [element.id]
    onSelectionChange(activeIds)

    const startBoxes: Record<string, Box> = {}
    for (const id of activeIds) {
      const candidate = layout.elements.find((el) => el.id === id)
      if (candidate) {
        startBoxes[id] = {
          x: candidate.x,
          y: candidate.y,
          width: candidate.width,
          height: candidate.height,
        }
      }
    }
    dragRef.current = {
      kind: "move",
      pointerId: event.pointerId,
      elementIds: activeIds,
      grabbedId: element.id,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startBoxes,
      moved: false,
    }
  }

  /** Pointerdown on the canvas background rather than an element (those call
   *  `stopPropagation()`, so this never fires for them). A plain click clears the selection
   *  immediately -- there is no drag yet to distinguish it from -- and a shift-click leaves the
   *  existing selection alone so a marquee can add to it. */
  function handleBackgroundPointerDown(event: React.PointerEvent) {
    ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
    if (!event.shiftKey) onSelectionChange([])
    dragRef.current = {
      kind: "marquee",
      pointerId: event.pointerId,
      additive: event.shiftKey,
      startClientX: event.clientX,
      startClientY: event.clientY,
      moved: false,
    }
  }

  function handlePointerMove(event: React.PointerEvent) {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return

    if (drag.kind === "marquee") {
      const screenDx = event.clientX - drag.startClientX
      const screenDy = event.clientY - drag.startClientY
      if (!drag.moved && Math.hypot(screenDx, screenDy) < DRAG_THRESHOLD_PX) return
      drag.moved = true
      const start = clientToCanvas(drag.startClientX, drag.startClientY)
      const current = clientToCanvas(event.clientX, event.clientY)
      setMarqueeBox({
        x: Math.min(start.x, current.x),
        y: Math.min(start.y, current.y),
        width: Math.abs(current.x - start.x),
        height: Math.abs(current.y - start.y),
      })
      return
    }

    // Pointer deltas are in screen pixels; the stage is scaled, so they have to be converted back
    // into canvas space or dragging would run at the wrong speed.
    const dx = (event.clientX - drag.startClientX) / scale
    const dy = (event.clientY - drag.startClientY) / scale
    if (!drag.moved && Math.hypot(dx * scale, dy * scale) < DRAG_THRESHOLD_PX) return
    drag.moved = true

    if (drag.kind === "move") {
      // Element-to-element snapping is tested against the grabbed element's own box (not the
      // whole group's), and only takes over an axis it actually finds a close match on -- the
      // other axis, or the whole thing when nothing is close, still falls back to the grid.
      const grabbedStart = drag.startBoxes[drag.grabbedId]
      const grabbedContinuous: Box = {
        x: grabbedStart.x + dx,
        y: grabbedStart.y + dy,
        width: grabbedStart.width,
        height: grabbedStart.height,
      }
      const others = snapToGrid
        ? layout.elements.filter((el) => !drag.elementIds.includes(el.id))
        : []
      const elementSnap = computeElementSnap(grabbedContinuous, others)

      const patches = new Map<string, Partial<AnnouncementLayoutElement>>()
      for (const id of drag.elementIds) {
        const start = drag.startBoxes[id]
        if (!start) continue
        const rawX = start.x + dx
        const rawY = start.y + dy
        patches.set(id, {
          x: elementSnap.guideX !== null ? Math.round(rawX + elementSnap.dx) : snap(rawX, snapToGrid),
          y: elementSnap.guideY !== null ? Math.round(rawY + elementSnap.dy) : snap(rawY, snapToGrid),
        })
      }
      updateElements(patches)
      setSnapGuides({ x: elementSnap.guideX, y: elementSnap.guideY })
      return
    }

    // Corner resize: the anchored corner stays put, so dragging a west/north handle moves the
    // origin as well as changing the size.
    const { startBox, handle } = drag
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

    // A circle is a shape locked to a 1:1 aspect ratio, so free-form width/height resize would
    // defeat the entire point of having a dedicated circle tool. Unify to a square after the
    // normal resize math above, then re-fix whichever edge the drag wasn't anchored to (the
    // opposite corner from the handle being dragged) so that corner doesn't drift.
    const element = layout.elements.find((candidate) => candidate.id === drag.elementId)
    if (element?.type === "shape" && element.kind === "circle") {
      const size = Math.max(width, height)
      width = size
      height = size
      if (!east) x = startBox.x + startBox.width - size
      if (!south) y = startBox.y + startBox.height - size
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

    if (drag.kind === "marquee") {
      if (drag.moved && marqueeBox) {
        const hits = layout.elements
          .filter((element) => boxesIntersect(element, marqueeBox))
          .map((element) => element.id)
        onSelectionChange(
          drag.additive ? Array.from(new Set([...selectedIds, ...hits])) : hits,
        )
      }
      setMarqueeBox(null)
    }

    if (drag.kind === "move") setSnapGuides({ x: null, y: null })
  }

  function removeElements(ids: string[]) {
    if (ids.length === 0) return
    const idSet = new Set(ids)
    onChange({ ...layout, elements: layout.elements.filter((element) => !idSet.has(element.id)) })
    onSelectionChange([])
  }

  function duplicateElements(ids: string[]) {
    if (ids.length === 0) return
    const idSet = new Set(ids)
    const copies = layout.elements
      .filter((element) => idSet.has(element.id))
      .map(
        (element) =>
          ({
            ...element,
            id: createElementId(element.type),
            x: element.x + 16,
            y: element.y + 16,
          }) as AnnouncementLayoutElement,
      )
    onChange({ ...layout, elements: [...layout.elements, ...copies] })
    onSelectionChange(copies.map((copy) => copy.id))
  }

  /** Bound to the stage rather than to each element, so it fires whether the pointer last landed
   *  on the element itself or on one of its resize handles. Acts on the whole selection. */
  function handleKeyDown(event: React.KeyboardEvent) {
    if (selectedIds.length === 0) return

    // Delete used to do nothing at all here: only the arrow keys were handled, so removing an
    // element meant finding the bin icon in the inspector every time.
    if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault()
      removeElements(selectedIds)
      return
    }
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "d") {
      event.preventDefault()
      duplicateElements(selectedIds)
      return
    }
    if (event.key === "Escape") {
      event.preventDefault()
      onSelectionChange([])
      return
    }

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
    const patches = new Map<string, Partial<AnnouncementLayoutElement>>()
    for (const element of layout.elements) {
      if (selectedIds.includes(element.id)) {
        patches.set(element.id, { x: element.x + delta[0], y: element.y + delta[1] })
      }
    }
    updateElements(patches)
  }

  return (
    <div
      ref={frameRef}
      className="flex w-full justify-center overflow-hidden rounded-xl border border-black/10 bg-[repeating-conic-gradient(#f4f4f5_0%_25%,#ffffff_0%_50%)] bg-[length:16px_16px] dark:border-white/10 dark:bg-[repeating-conic-gradient(#27272a_0%_25%,#18181b_0%_50%)]"
      style={{ height: canvasHeight * scale }}
      onPointerDown={handleBackgroundPointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    >
      <div
        ref={stageRef}
        data-testid="announcement-stage"
        // Focusable and owning the keyboard shortcuts, so they work no matter which part of an
        // element was grabbed. Each element stays focusable in its own right for tab navigation;
        // its keydown simply bubbles up to here.
        tabIndex={0}
        onKeyDown={handleKeyDown}
        // shrink-0: `stage` is a flex child of `frame`, and its width/height come from an inline
        // style rather than intrinsic content, so without this flexbox's default flex-shrink:1
        // silently compresses the stage below its declared size once canvasWidth exceeds the
        // frame's available width -- landscape's 1056px does this far more often than portrait's
        // 816px did. `transform: scale()` below never participates in that layout sizing, so the
        // shrink and the scale would fight each other and corrupt every element's absolute
        // position, which is what made elements vanish off the clipped (`overflow-hidden`) edge.
        className="relative origin-top-left outline-none shrink-0"
        style={{
          width: canvasWidth,
          height: canvasHeight,
          transform: `scale(${scale})`,
          // A transform doesn't shrink the layout box, so a scaled-down stage would still occupy
          // its full unscaled width and defeat the centering. Pulling the right edge in by the
          // difference makes the box measure what the eye sees.
          marginRight: canvasWidth * (scale - 1),
          backgroundColor: layout.background,
        }}
      >
        {layout.elements.map((element) => {
          const selected = selectedIds.includes(element.id)
          const style = layoutElementStyle(
            element,
            CANVAS_STYLE_OPTIONS,
          ) as React.CSSProperties
          return (
            <div
              key={element.id}
              role="button"
              tabIndex={0}
              aria-label={describeElement(element)}
              aria-pressed={selected}
              className="cursor-move focus:outline-none"
              style={style}
              onPointerDown={(event) => handleElementPointerDown(event, element, null)}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
            >
              {element.type === "text" && element.text}
              {element.type === "button" && element.label}
            </div>
          )
        })}

        {/* Selection chrome is drawn after the elements so it always sits on top, and its
            dimensions are divided by the scale so the outline and handles stay the same visual
            thickness no matter how far the stage is zoomed out. Resize handles only appear when
            exactly one element is selected -- resizing a group by a shared bounding box is a
            different, more ambiguous operation this doesn't attempt. */}
        {layout.elements
          .filter((element) => selectedIds.includes(element.id))
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
              {selectedIds.length === 1 &&
                HANDLES.map((handle) => (
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
                    onPointerDown={(event) => handleElementPointerDown(event, element, handle.id)}
                    onPointerMove={handlePointerMove}
                    onPointerUp={handlePointerUp}
                  />
                ))}
            </div>
          ))}

        {/* The live marquee rectangle. Selection itself only applies on release -- this is only
            ever visual feedback while dragging. */}
        {marqueeBox && (
          <div
            className="pointer-events-none absolute border border-[var(--brand-teal)] bg-[var(--brand-teal)]/10"
            style={{
              left: marqueeBox.x,
              top: marqueeBox.y,
              width: marqueeBox.width,
              height: marqueeBox.height,
              borderWidth: 1 / scale,
            }}
          />
        )}

        {/* Smart-guide lines while an element-to-element snap is active during a move. A
            distinct colour from the teal selection/marquee chrome, the same convention other
            design tools use so "you're selected" and "you're aligned to something" never read as
            the same signal. */}
        {snapGuides.x !== null && (
          <div
            data-testid="snap-guide-x"
            className="pointer-events-none absolute inset-y-0 bg-[#ec4899]"
            style={{ left: snapGuides.x, width: 1 / scale }}
          />
        )}
        {snapGuides.y !== null && (
          <div
            data-testid="snap-guide-y"
            className="pointer-events-none absolute inset-x-0 bg-[#ec4899]"
            style={{ top: snapGuides.y, height: 1 / scale }}
          />
        )}
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
      // Named by kind, so a layer list of four shapes isn't four identical rows.
      return `${element.kind.charAt(0).toUpperCase()}${element.kind.slice(1)}`
  }
}

/** A compact z-order list of everything on the canvas. The reliable way to reach an element
 *  that's been dragged underneath another one, where clicking would only ever hit the top. */
export function LayerList({
  layout,
  selectedIds,
  onSelect,
}: {
  layout: AnnouncementLayout
  selectedIds: string[]
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
              selectedIds.includes(element.id)
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
