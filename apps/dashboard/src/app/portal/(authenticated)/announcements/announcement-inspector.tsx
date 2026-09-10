"use client"

import * as React from "react"
import {
  TypeIcon,
  ImageIcon,
  SquareIcon,
  CircleIcon,
  MinusIcon,
  TriangleIcon,
  MousePointerClickIcon,
  Trash2Icon,
  CopyIcon,
  ArrowUpIcon,
  ArrowDownIcon,
  BoldIcon,
  ItalicIcon,
  UnderlineIcon,
  StrikethroughIcon,
  AlignHorizontalJustifyStartIcon,
  AlignHorizontalJustifyCenterIcon,
  AlignHorizontalJustifyEndIcon,
  AlignVerticalJustifyStartIcon,
  AlignVerticalJustifyCenterIcon,
  AlignVerticalJustifyEndIcon,
  AlignHorizontalDistributeCenterIcon,
  AlignVerticalDistributeCenterIcon,
} from "lucide-react"
import { cn } from "@/lib/utils"
import {
  ANNOUNCEMENT_CANVAS_PRESETS,
  KIOSK_SAFE_FONTS,
  SHAPE_KINDS,
  TEXT_TRANSFORMS,
  canvasPresetFor,
  createElementId,
  resizeLayout,
  type AnnouncementLayout,
  type AnnouncementLayoutElement,
  type LayoutAction,
  type LayoutElementType,
  type ShapeKind,
} from "@saverlly/shared-types"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Combobox } from "@/components/ui/combobox"
import { Toggle } from "@/components/ui/toggle"
import { FormField, FormGrid } from "@/components/dashboard/form-section"
import { ImageUploadField } from "@/components/dashboard/image-upload-field"

const FONT_OPTIONS = KIOSK_SAFE_FONTS.map((font) => ({ value: font, label: font }))

const WEIGHT_OPTIONS = [
  { value: "300", label: "Light" },
  { value: "400", label: "Regular" },
  { value: "500", label: "Medium" },
  { value: "600", label: "Semibold" },
  { value: "700", label: "Bold" },
  { value: "800", label: "Extrabold" },
]

const ALIGN_OPTIONS = [
  { value: "left", label: "Left" },
  { value: "center", label: "Center" },
  { value: "right", label: "Right" },
]

const TEXT_TRANSFORM_LABEL: Record<(typeof TEXT_TRANSFORMS)[number], string> = {
  none: "Normal",
  uppercase: "UPPERCASE",
  lowercase: "lowercase",
  capitalize: "Capitalize",
}
const TEXT_TRANSFORM_OPTIONS = TEXT_TRANSFORMS.map((value) => ({
  value,
  label: TEXT_TRANSFORM_LABEL[value],
}))

const FIT_OPTIONS = [
  { value: "cover", label: "Fill the box (crop)" },
  { value: "contain", label: "Fit inside (letterbox)" },
]

export type CanvasSize = { width: number; height: number }

export const SHAPE_KIND_LABEL: Record<ShapeKind, string> = {
  rectangle: "Rectangle",
  ellipse: "Ellipse",
  circle: "Circle",
  line: "Line",
  triangle: "Triangle",
}

/** Stretched horizontally so it doesn't sit in the toolbar looking identical to Circle's icon --
 *  the two are otherwise the same glyph (`CircleIcon`), which is exactly the confusion a
 *  dedicated Circle shape is meant to resolve. */
function EllipseIcon(props: React.ComponentProps<typeof CircleIcon>) {
  return <CircleIcon {...props} className={cn(props.className, "scale-x-150")} />
}

const SHAPE_KIND_ICON: Record<ShapeKind, React.ComponentType<React.ComponentProps<typeof CircleIcon>>> = {
  rectangle: SquareIcon,
  ellipse: EllipseIcon,
  circle: CircleIcon,
  line: MinusIcon,
  triangle: TriangleIcon,
}

/** Canvas presets are stored in CSS pixels (96 per inch, the device-independent-pixel mapping
 *  this codebase uses everywhere -- see ANNOUNCEMENT_CANVAS_WIDTH's own comment), but the client
 *  thinks and asked for this in inches ("8.5 x 11"), not "816×1056". */
function formatInches(px: number): string {
  const inches = px / 96
  return Number.isInteger(inches) ? String(inches) : inches.toFixed(1)
}

/** A new element's size, clamped so it still fits a canvas smaller than the size it assumes. */
function fitted(canvas: CanvasSize, width: number, height: number) {
  const w = Math.min(width, Math.round(canvas.width * 0.8))
  const h = Math.min(height, Math.round(canvas.height * 0.8))
  // Centred rather than at 0,0. Dropping a new element under the toolbar where it is half
  // off-screen makes the first interaction a drag, every time.
  return {
    x: Math.round((canvas.width - w) / 2),
    y: Math.round((canvas.height - h) / 2),
    width: w,
    height: h,
  }
}

/** A line is a bar, not a box: its height is its thickness, so it gets its own proportions. */
function fittedLine(canvas: CanvasSize) {
  const width = Math.round(canvas.width * 0.6)
  return {
    x: Math.round((canvas.width - width) / 2),
    y: Math.round(canvas.height / 2),
    width,
    height: 4,
  }
}

export function createElement(
  type: LayoutElementType,
  canvas: CanvasSize,
  shapeKind: ShapeKind = "rectangle",
): AnnouncementLayoutElement | null {
  const id = createElementId(type)
  switch (type) {
    case "text":
      return {
        id,
        type: "text",
        ...fitted(canvas, 320, 56),
        text: "New text",
        fontFamily: "Segoe UI",
        fontSize: 22,
        fontWeight: 600,
        color: "#111111",
        align: "center",
        italic: false,
        underline: false,
        strikethrough: false,
        overline: false,
        textTransform: "none",
        letterSpacing: 0,
        action: null,
      }
    case "button":
      return {
        id,
        type: "button",
        ...fitted(canvas, 176, 44),
        label: "Dismiss",
        backgroundColor: "#0f766e",
        color: "#ffffff",
        fontFamily: "Segoe UI",
        fontSize: 16,
        fontWeight: 600,
        radius: 8,
        action: { type: "dismiss" },
      }
    case "shape":
      return {
        id,
        type: "shape",
        ...(shapeKind === "line"
          ? fittedLine(canvas)
          : shapeKind === "circle"
            ? fitted(canvas, 160, 160)
            : fitted(canvas, 240, 160)),
        kind: shapeKind,
        fill: "#e2e8f0",
        radius: shapeKind === "rectangle" ? 12 : 0,
      }
    case "image":
      // An image element with no URL can't be rendered, so one is only created once an upload
      // completes or a URL is pasted. See CanvasToolbar below.
      return null
  }
}

export function CanvasToolbar({
  onAdd,
  onAddShape,
  onUploadFile,
  isUploading,
  imageUrl,
  onImageUrlChange,
}: {
  onAdd: (type: LayoutElementType) => void
  onAddShape: (kind: ShapeKind) => void
  onUploadFile: (file: File) => void
  isUploading: boolean
  imageUrl: string
  onImageUrlChange: (url: string) => void
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={() => onAdd("text")}>
          <TypeIcon className="size-4" />
          Text
        </Button>
        <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={() => onAdd("button")}>
          <MousePointerClickIcon className="size-4" />
          Button
        </Button>
      </div>

      {/* One button per shape, rather than a single "Shape" that always made a rectangle. There
          was no kind discriminator at all before, so the only way to a circle was cranking the
          corner radius to 999 on a square, and lines and triangles were unreachable. */}
      <div className="flex flex-col gap-1.5">
        <span className="text-xs text-muted-foreground">Shapes</span>
        <div className="flex flex-wrap gap-2">
          {SHAPE_KINDS.map((kind) => {
            const Icon = SHAPE_KIND_ICON[kind]
            return (
              <Button
                key={kind}
                type="button"
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={() => onAddShape(kind)}
              >
                <Icon className="size-4" />
                {SHAPE_KIND_LABEL[kind]}
              </Button>
            )
          })}
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="ann-canvas-image" className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <ImageIcon className="size-3.5" />
          Add an image
        </Label>
        <ImageUploadField
          id="ann-canvas-image"
          value={imageUrl}
          onChange={onImageUrlChange}
          onUploadFile={onUploadFile}
          isUploading={isUploading}
        />
      </div>
    </div>
  )
}

const ACTION_OPTIONS = [
  { value: "dismiss", label: "Close the announcement" },
  { value: "url", label: "Open a web page" },
  { value: "email", label: "Start an email" },
]

/**
 * What clicking this element does.
 *
 * Buttons had no action at all before: the renderer stamped `data-saverlly-dismiss` on every one
 * of them, so a button could only ever close the toast no matter what its label said.
 */
function ActionField({
  idPrefix,
  action,
  onChange,
  allowNone,
}: {
  idPrefix: string
  action: LayoutAction | null
  onChange: (action: LayoutAction | null) => void
  /** Text is plain type unless it is deliberately linked, so it gets a "do nothing" option that
   *  a button does not. */
  allowNone?: boolean
}) {
  const value = action?.type ?? "none"
  const options = allowNone
    ? [{ value: "none", label: "Nothing (plain text)" }, ...ACTION_OPTIONS]
    : ACTION_OPTIONS

  function pick(next: string) {
    if (next === "none") return onChange(null)
    if (next === "url") return onChange({ type: "url", href: "https://" })
    if (next === "email") return onChange({ type: "email", address: "" })
    onChange({ type: "dismiss" })
  }

  return (
    <>
      <FormField label="On click" htmlFor={`${idPrefix}-action`}>
        <Combobox
          id={`${idPrefix}-action`}
          value={value}
          onValueChange={pick}
          options={options}
        />
      </FormField>
      {action?.type === "url" && (
        <FormField
          label="Web address"
          htmlFor={`${idPrefix}-href`}
          hint="Must start with http:// or https://. It opens in the kiosk's browser."
        >
          <Input
            id={`${idPrefix}-href`}
            type="url"
            value={action.href}
            spellCheck={false}
            onChange={(event) => onChange({ type: "url", href: event.target.value })}
          />
        </FormField>
      )}
      {action?.type === "email" && (
        <FormField
          label="Email address"
          htmlFor={`${idPrefix}-email`}
          hint="Opens the kiosk's mail app with a new message to this address."
        >
          <Input
            id={`${idPrefix}-email`}
            type="email"
            value={action.address}
            spellCheck={false}
            onChange={(event) => onChange({ type: "email", address: event.target.value })}
          />
        </FormField>
      )}
    </>
  )
}

function ColorField({
  label,
  id,
  value,
  onChange,
}: {
  label: string
  id: string
  value: string
  onChange: (value: string) => void
}) {
  return (
    <FormField label={label} htmlFor={id}>
      <div className="flex items-center gap-2">
        <input
          id={id}
          type="color"
          value={value === "transparent" ? "#ffffff" : value.slice(0, 7)}
          onChange={(event) => onChange(event.target.value)}
          className="size-9 shrink-0 cursor-pointer rounded-md border border-black/10 bg-transparent p-0.5 dark:border-white/10"
          aria-label={label}
        />
        <Input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="font-mono text-xs"
          spellCheck={false}
        />
      </div>
    </FormField>
  )
}

function NumberField({
  label,
  id,
  value,
  onChange,
  min,
  max,
}: {
  label: string
  id: string
  value: number
  onChange: (value: number) => void
  min?: number
  max?: number
}) {
  return (
    <FormField label={label} htmlFor={id}>
      <Input
        id={id}
        type="number"
        min={min}
        max={max}
        value={value}
        onChange={(event) => {
          const next = Number(event.target.value)
          if (Number.isFinite(next)) onChange(next)
        }}
      />
    </FormField>
  )
}

type AlignOp = "left" | "centerH" | "right" | "top" | "centerV" | "bottom" | "distributeH" | "distributeV"

function boundingBoxOf(elements: AnnouncementLayoutElement[]) {
  return {
    left: Math.min(...elements.map((el) => el.x)),
    top: Math.min(...elements.map((el) => el.y)),
    right: Math.max(...elements.map((el) => el.x + el.width)),
    bottom: Math.max(...elements.map((el) => el.y + el.height)),
  }
}

/**
 * Moves every selected element per `op`, then returns the updated layout. A single element
 * aligns to the canvas bounds (there's nothing else to align it to); two or more align to their
 * own bounding box instead, matching every other design tool's convention. Distribute needs a
 * middle to space out, so it's a no-op below three elements -- the toolbar disables those buttons
 * for exactly that reason rather than silently doing nothing.
 */
function alignElements(layout: AnnouncementLayout, selectedIds: string[], op: AlignOp): AnnouncementLayout {
  const selected = layout.elements.filter((element) => selectedIds.includes(element.id))
  if (selected.length === 0) return layout

  const box =
    selected.length === 1
      ? { left: 0, top: 0, right: layout.width, bottom: layout.height }
      : boundingBoxOf(selected)

  const patches = new Map<string, Partial<AnnouncementLayoutElement>>()

  if (op === "distributeH" || op === "distributeV") {
    if (selected.length < 3) return layout
    const axis = op === "distributeH" ? "x" : "y"
    const size = op === "distributeH" ? "width" : "height"
    const centerOf = (el: AnnouncementLayoutElement) => el[axis] + el[size] / 2
    const sorted = [...selected].sort((a, b) => centerOf(a) - centerOf(b))
    const firstCenter = centerOf(sorted[0])
    const lastCenter = centerOf(sorted[sorted.length - 1])
    const step = (lastCenter - firstCenter) / (sorted.length - 1)
    // Only the interior elements move; the two endpoints anchor the span being distributed
    // across, the same way the first and last stops on a ruler don't move either.
    sorted.slice(1, -1).forEach((element, index) => {
      const center = firstCenter + step * (index + 1)
      patches.set(element.id, { [axis]: Math.round(center - element[size] / 2) } as Partial<AnnouncementLayoutElement>)
    })
  } else {
    for (const element of selected) {
      switch (op) {
        case "left":
          patches.set(element.id, { x: box.left })
          break
        case "centerH":
          patches.set(element.id, { x: Math.round(box.left + (box.right - box.left) / 2 - element.width / 2) })
          break
        case "right":
          patches.set(element.id, { x: box.right - element.width })
          break
        case "top":
          patches.set(element.id, { y: box.top })
          break
        case "centerV":
          patches.set(element.id, { y: Math.round(box.top + (box.bottom - box.top) / 2 - element.height / 2) })
          break
        case "bottom":
          patches.set(element.id, { y: box.bottom - element.height })
          break
      }
    }
  }

  return {
    ...layout,
    elements: layout.elements.map((element) =>
      patches.has(element.id) ? ({ ...element, ...patches.get(element.id) } as AnnouncementLayoutElement) : element,
    ),
  }
}

function AlignmentToolbar({
  onAlign,
  canDistribute,
}: {
  onAlign: (op: AlignOp) => void
  canDistribute: boolean
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs text-muted-foreground">Align</span>
      <div className="flex flex-wrap gap-1">
        <Button type="button" variant="outline" size="icon-sm" onClick={() => onAlign("left")} aria-label="Align left">
          <AlignHorizontalJustifyStartIcon className="size-3.5" />
        </Button>
        <Button type="button" variant="outline" size="icon-sm" onClick={() => onAlign("centerH")} aria-label="Align center horizontally">
          <AlignHorizontalJustifyCenterIcon className="size-3.5" />
        </Button>
        <Button type="button" variant="outline" size="icon-sm" onClick={() => onAlign("right")} aria-label="Align right">
          <AlignHorizontalJustifyEndIcon className="size-3.5" />
        </Button>
        <Button type="button" variant="outline" size="icon-sm" onClick={() => onAlign("top")} aria-label="Align top">
          <AlignVerticalJustifyStartIcon className="size-3.5" />
        </Button>
        <Button type="button" variant="outline" size="icon-sm" onClick={() => onAlign("centerV")} aria-label="Align middle vertically">
          <AlignVerticalJustifyCenterIcon className="size-3.5" />
        </Button>
        <Button type="button" variant="outline" size="icon-sm" onClick={() => onAlign("bottom")} aria-label="Align bottom">
          <AlignVerticalJustifyEndIcon className="size-3.5" />
        </Button>
        <Button
          type="button"
          variant="outline"
          size="icon-sm"
          onClick={() => onAlign("distributeH")}
          disabled={!canDistribute}
          aria-label="Distribute horizontally"
        >
          <AlignHorizontalDistributeCenterIcon className="size-3.5" />
        </Button>
        <Button
          type="button"
          variant="outline"
          size="icon-sm"
          onClick={() => onAlign("distributeV")}
          disabled={!canDistribute}
          aria-label="Distribute vertically"
        >
          <AlignVerticalDistributeCenterIcon className="size-3.5" />
        </Button>
      </div>
    </div>
  )
}

/**
 * Properties of whatever is selected on the canvas. Deliberately shows only what the kiosk
 * renderer can actually honour. The font list is the Windows-stock set, because a webfont would
 * silently fall back to something else on the kiosk and make the design a lie.
 */
export function ElementInspector({
  layout,
  selectedIds,
  onChange,
  onSelectionChange,
}: {
  layout: AnnouncementLayout
  selectedIds: string[]
  onChange: (layout: AnnouncementLayout) => void
  onSelectionChange: (ids: string[]) => void
}) {
  const element =
    selectedIds.length === 1 ? (layout.elements.find((candidate) => candidate.id === selectedIds[0]) ?? null) : null

  function update(patch: Partial<AnnouncementLayoutElement>) {
    if (!element) return
    onChange({
      ...layout,
      elements: layout.elements.map((candidate) =>
        candidate.id === element.id
          ? ({ ...candidate, ...patch } as AnnouncementLayoutElement)
          : candidate,
      ),
    })
  }

  function remove() {
    if (!element) return
    onChange({
      ...layout,
      elements: layout.elements.filter((candidate) => candidate.id !== element.id),
    })
    onSelectionChange([])
  }

  function duplicate() {
    if (!element) return
    const copy = {
      ...element,
      id: createElementId(element.type),
      x: element.x + 16,
      y: element.y + 16,
    } as AnnouncementLayoutElement
    onChange({ ...layout, elements: [...layout.elements, copy] })
    onSelectionChange([copy.id])
  }

  /** Array order is z-order (later = on top), so reordering the array is the whole operation. */
  function reorder(direction: -1 | 1) {
    if (!element) return
    const index = layout.elements.findIndex((candidate) => candidate.id === element.id)
    const target = index + direction
    if (target < 0 || target >= layout.elements.length) return
    const elements = [...layout.elements]
    ;[elements[index], elements[target]] = [elements[target], elements[index]]
    onChange({ ...layout, elements })
  }

  function removeMany() {
    const idSet = new Set(selectedIds)
    onChange({ ...layout, elements: layout.elements.filter((candidate) => !idSet.has(candidate.id)) })
    onSelectionChange([])
  }

  function duplicateMany() {
    const idSet = new Set(selectedIds)
    const copies = layout.elements
      .filter((candidate) => idSet.has(candidate.id))
      .map(
        (candidate) =>
          ({
            ...candidate,
            id: createElementId(candidate.type),
            x: candidate.x + 16,
            y: candidate.y + 16,
          }) as AnnouncementLayoutElement,
      )
    onChange({ ...layout, elements: [...layout.elements, ...copies] })
    onSelectionChange(copies.map((copy) => copy.id))
  }

  if (selectedIds.length > 1) {
    return (
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-semibold tracking-[0.08em] text-muted-foreground uppercase">
            {selectedIds.length} selected
          </span>
          <div className="flex items-center gap-1">
            <Button type="button" variant="ghost" size="icon-sm" onClick={duplicateMany} aria-label="Duplicate selection">
              <CopyIcon className="size-3.5" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={removeMany}
              aria-label="Delete selection"
              className="text-destructive hover:bg-destructive/10 hover:text-destructive"
            >
              <Trash2Icon className="size-3.5" />
            </Button>
          </div>
        </div>
        <p className="text-sm text-muted-foreground">
          Drag any of them to move the group together, press Delete to remove all {selectedIds.length}, or
          shift-click one to remove it from the selection.
        </p>
        <AlignmentToolbar
          onAlign={(op) => onChange(alignElements(layout, selectedIds, op))}
          canDistribute={selectedIds.length >= 3}
        />
      </div>
    )
  }

  if (!element) {
    const preset = canvasPresetFor(layout)
    return (
      <div className="flex flex-col gap-4">
        {/* Size used to be two compile-time constants, which is why "how do I change the doc
            size" had no answer. Changing it here rescales and re-centres the design rather than
            leaving half of it off the new edge. */}
        <FormField
          label="Canvas size"
          htmlFor="ann-canvas-size"
          hint={preset?.hint ?? `Custom, ${layout.width} by ${layout.height}.`}
        >
          <Combobox
            id="ann-canvas-size"
            value={preset?.id ?? ""}
            onValueChange={(id) => {
              const next = ANNOUNCEMENT_CANVAS_PRESETS.find((candidate) => candidate.id === id)
              if (next) onChange(resizeLayout(layout, next.width, next.height))
            }}
            placeholder="Custom size"
            options={ANNOUNCEMENT_CANVAS_PRESETS.map((candidate) => ({
              value: candidate.id,
              label: `${candidate.label} (${formatInches(candidate.width)} × ${formatInches(candidate.height)}")`,
            }))}
          />
        </FormField>
        <ColorField
          label="Canvas background"
          id="ann-canvas-bg"
          value={layout.background}
          onChange={(background) => onChange({ ...layout, background })}
        />
        <p className="text-sm text-muted-foreground">
          Select something on the canvas to edit it.
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold tracking-[0.08em] text-muted-foreground uppercase">
          {element.type}
        </span>
        <div className="flex items-center gap-1">
          <Button type="button" variant="ghost" size="icon-sm" onClick={() => reorder(1)} aria-label="Bring forward">
            <ArrowUpIcon className="size-3.5" />
          </Button>
          <Button type="button" variant="ghost" size="icon-sm" onClick={() => reorder(-1)} aria-label="Send backward">
            <ArrowDownIcon className="size-3.5" />
          </Button>
          <Button type="button" variant="ghost" size="icon-sm" onClick={duplicate} aria-label="Duplicate element">
            <CopyIcon className="size-3.5" />
          </Button>
          {/* No longer blocked when this is the last button. The rendered toast always draws its
              own close button and dismisses itself on a timer, so a buttonless design cannot
              strand a kiosk, and refusing the delete was the editor overruling the owner. */}
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={remove}
            aria-label="Delete element"
            className="text-destructive hover:bg-destructive/10 hover:text-destructive"
          >
            <Trash2Icon className="size-3.5" />
          </Button>
        </div>
      </div>

      {element.type === "text" && (
        <>
          <FormField label="Text" htmlFor="ann-el-text">
            <Textarea
              id="ann-el-text"
              rows={3}
              value={element.text}
              onChange={(event) => update({ text: event.target.value })}
            />
          </FormField>
          <FormField label="Font" htmlFor="ann-el-font">
            <Combobox
              id="ann-el-font"
              value={element.fontFamily}
              onValueChange={(fontFamily) => update({ fontFamily })}
              options={FONT_OPTIONS}
            />
          </FormField>
          <FormGrid>
            <NumberField
              label="Size"
              id="ann-el-size"
              value={element.fontSize}
              onChange={(fontSize) => update({ fontSize })}
              min={8}
              max={200}
            />
            <FormField label="Weight" htmlFor="ann-el-weight">
              <Combobox
                id="ann-el-weight"
                value={String(element.fontWeight)}
                onValueChange={(weight) => update({ fontWeight: Number(weight) })}
                options={WEIGHT_OPTIONS}
              />
            </FormField>
          </FormGrid>
          <FormField label="Style" htmlFor="ann-el-style-bold">
            <div className="flex items-center gap-1">
              <Toggle
                id="ann-el-style-bold"
                size="sm"
                variant="outline"
                pressed={element.fontWeight >= 700}
                onPressedChange={(pressed) => update({ fontWeight: pressed ? 700 : 400 })}
                aria-label="Bold"
              >
                <BoldIcon />
              </Toggle>
              <Toggle
                size="sm"
                variant="outline"
                pressed={element.italic}
                onPressedChange={(italic) => update({ italic })}
                aria-label="Italic"
              >
                <ItalicIcon />
              </Toggle>
              <Toggle
                size="sm"
                variant="outline"
                pressed={element.underline}
                onPressedChange={(underline) => update({ underline })}
                aria-label="Underline"
              >
                <UnderlineIcon />
              </Toggle>
              <Toggle
                size="sm"
                variant="outline"
                pressed={element.strikethrough}
                onPressedChange={(strikethrough) => update({ strikethrough })}
                aria-label="Strikethrough"
              >
                <StrikethroughIcon />
              </Toggle>
              <Toggle
                size="sm"
                variant="outline"
                pressed={element.overline}
                onPressedChange={(overline) => update({ overline })}
                aria-label="Overline"
              >
                <span style={{ textDecoration: "overline" }}>O</span>
              </Toggle>
            </div>
          </FormField>
          <FormGrid>
            <FormField label="Text case" htmlFor="ann-el-transform">
              <Combobox
                id="ann-el-transform"
                value={element.textTransform}
                onValueChange={(textTransform) =>
                  update({ textTransform: textTransform as (typeof TEXT_TRANSFORMS)[number] })
                }
                options={TEXT_TRANSFORM_OPTIONS}
              />
            </FormField>
            <NumberField
              label="Letter spacing"
              id="ann-el-letter-spacing"
              value={element.letterSpacing}
              onChange={(letterSpacing) => update({ letterSpacing })}
              min={-10}
              max={100}
            />
          </FormGrid>
          <FormField label="Alignment" htmlFor="ann-el-align">
            <Combobox
              id="ann-el-align"
              value={element.align}
              onValueChange={(align) => update({ align: align as "left" | "center" | "right" })}
              options={ALIGN_OPTIONS}
            />
          </FormField>
          <ColorField
            label="Colour"
            id="ann-el-color"
            value={element.color}
            onChange={(color) => update({ color })}
          />
          <ActionField
            idPrefix="ann-el-text"
            action={element.action}
            onChange={(action) => update({ action })}
            allowNone
          />
        </>
      )}

      {element.type === "image" && (
        <>
          <FormField label="Fit" htmlFor="ann-el-fit">
            <Combobox
              id="ann-el-fit"
              value={element.fit}
              onValueChange={(fit) => update({ fit: fit as "cover" | "contain" })}
              options={FIT_OPTIONS}
            />
          </FormField>
          <NumberField
            label="Corner radius"
            id="ann-el-radius"
            value={element.radius}
            onChange={(radius) => update({ radius })}
            min={0}
          />
        </>
      )}

      {element.type === "button" && (
        <>
          <FormField label="Label" htmlFor="ann-el-label">
            <Input
              id="ann-el-label"
              value={element.label}
              onChange={(event) => update({ label: event.target.value })}
            />
          </FormField>
          <ColorField
            label="Background"
            id="ann-el-bg"
            value={element.backgroundColor}
            onChange={(backgroundColor) => update({ backgroundColor })}
          />
          <ColorField
            label="Text colour"
            id="ann-el-btn-color"
            value={element.color}
            onChange={(color) => update({ color })}
          />
          <FormGrid>
            <NumberField
              label="Size"
              id="ann-el-btn-size"
              value={element.fontSize}
              onChange={(fontSize) => update({ fontSize })}
              min={8}
              max={200}
            />
            <NumberField
              label="Corner radius"
              id="ann-el-btn-radius"
              value={element.radius}
              onChange={(radius) => update({ radius })}
              min={0}
            />
          </FormGrid>
          <ActionField
            idPrefix="ann-el-btn"
            action={element.action}
            onChange={(action) => update({ action: action ?? { type: "dismiss" } })}
          />
        </>
      )}

      {element.type === "shape" && (
        <>
          <FormField label="Shape" htmlFor="ann-el-shape-kind">
            <Combobox
              id="ann-el-shape-kind"
              value={element.kind}
              onValueChange={(kind) => update({ kind: kind as ShapeKind })}
              options={SHAPE_KINDS.map((kind) => ({
                value: kind,
                label: SHAPE_KIND_LABEL[kind],
              }))}
            />
          </FormField>
          <ColorField
            label="Fill"
            id="ann-el-fill"
            value={element.fill}
            onChange={(fill) => update({ fill })}
          />
          {/* Only a rectangle has corners to round. An ellipse is always fully round, a line is
              capped to its own thickness, and a triangle is clipped to its points. */}
          {element.kind === "rectangle" && (
            <NumberField
              label="Corner radius"
              id="ann-el-shape-radius"
              value={element.radius}
              onChange={(radius) => update({ radius })}
              min={0}
            />
          )}
          {element.kind === "line" && (
            <NumberField
              label="Thickness"
              id="ann-el-shape-thickness"
              value={element.height}
              onChange={(height) => update({ height })}
              min={1}
              max={64}
            />
          )}
        </>
      )}

      <FormGrid>
        <NumberField label="X" id="ann-el-x" value={element.x} onChange={(x) => update({ x })} />
        <NumberField label="Y" id="ann-el-y" value={element.y} onChange={(y) => update({ y })} />
        <NumberField
          label="Width"
          id="ann-el-w"
          value={element.width}
          onChange={(width) => update({ width })}
          min={16}
        />
        <NumberField
          label="Height"
          id="ann-el-h"
          value={element.height}
          onChange={(height) => update({ height })}
          min={16}
        />
      </FormGrid>

      {/* A single element has nothing else to align to, so this aligns it to the canvas bounds
          instead -- centering it, or snapping it to an edge, without hand-typing X/Y. */}
      <AlignmentToolbar onAlign={(op) => onChange(alignElements(layout, selectedIds, op))} canDistribute={false} />
    </div>
  )
}
