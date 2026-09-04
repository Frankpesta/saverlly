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
} from "lucide-react"
import {
  ANNOUNCEMENT_CANVAS_PRESETS,
  KIOSK_SAFE_FONTS,
  SHAPE_KINDS,
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

const FIT_OPTIONS = [
  { value: "cover", label: "Fill the box (crop)" },
  { value: "contain", label: "Fit inside (letterbox)" },
]

export type CanvasSize = { width: number; height: number }

export const SHAPE_KIND_LABEL: Record<ShapeKind, string> = {
  rectangle: "Rectangle",
  ellipse: "Ellipse",
  line: "Line",
  triangle: "Triangle",
}

const SHAPE_KIND_ICON: Record<ShapeKind, typeof SquareIcon> = {
  rectangle: SquareIcon,
  ellipse: CircleIcon,
  line: MinusIcon,
  triangle: TriangleIcon,
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
        ...(shapeKind === "line" ? fittedLine(canvas) : fitted(canvas, 240, 160)),
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

/**
 * Properties of whatever is selected on the canvas. Deliberately shows only what the kiosk
 * renderer can actually honour. The font list is the Windows-stock set, because a webfont would
 * silently fall back to something else on the kiosk and make the design a lie.
 */
export function ElementInspector({
  layout,
  selectedId,
  onChange,
  onSelect,
}: {
  layout: AnnouncementLayout
  selectedId: string | null
  onChange: (layout: AnnouncementLayout) => void
  onSelect: (id: string | null) => void
}) {
  const element = layout.elements.find((candidate) => candidate.id === selectedId) ?? null

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
    onSelect(null)
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
    onSelect(copy.id)
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
              label: `${candidate.label} (${candidate.width}×${candidate.height})`,
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
    </div>
  )
}
