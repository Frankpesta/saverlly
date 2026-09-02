"use client"

import * as React from "react"
import {
  TypeIcon,
  ImageIcon,
  SquareIcon,
  MousePointerClickIcon,
  Trash2Icon,
  CopyIcon,
  ArrowUpIcon,
  ArrowDownIcon,
} from "lucide-react"
import {
  ANNOUNCEMENT_CANVAS_HEIGHT,
  ANNOUNCEMENT_CANVAS_WIDTH,
  KIOSK_SAFE_FONTS,
  createElementId,
  type AnnouncementLayout,
  type AnnouncementLayoutElement,
  type LayoutElementType,
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

/** New elements land in the middle of the canvas rather than at 0,0 — dropping them under the
 *  toolbar where they're half off-screen makes the first interaction a drag every time. */
function centered(width: number, height: number) {
  return {
    x: Math.round((ANNOUNCEMENT_CANVAS_WIDTH - width) / 2),
    y: Math.round((ANNOUNCEMENT_CANVAS_HEIGHT - height) / 2),
    width,
    height,
  }
}

export function createElement(type: LayoutElementType): AnnouncementLayoutElement | null {
  const id = createElementId(type)
  switch (type) {
    case "text":
      return {
        id,
        type: "text",
        ...centered(320, 56),
        text: "New text",
        fontFamily: "Segoe UI",
        fontSize: 22,
        fontWeight: 600,
        color: "#111111",
        align: "center",
        italic: false,
      }
    case "button":
      return {
        id,
        type: "button",
        ...centered(176, 44),
        label: "Dismiss",
        backgroundColor: "#0f766e",
        color: "#ffffff",
        fontFamily: "Segoe UI",
        fontSize: 16,
        fontWeight: 600,
        radius: 8,
      }
    case "shape":
      return {
        id,
        type: "shape",
        ...centered(240, 160),
        fill: "#e2e8f0",
        radius: 12,
      }
    case "image":
      // An image element with no URL can't be rendered, so one is only created once an upload
      // completes — see AddImageButton below.
      return null
  }
}

export function CanvasToolbar({
  onAdd,
  onUploadFile,
  isUploading,
  imageUrl,
  onImageUrlChange,
}: {
  onAdd: (type: LayoutElementType) => void
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
        <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={() => onAdd("shape")}>
          <SquareIcon className="size-4" />
          Shape
        </Button>
        <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={() => onAdd("button")}>
          <MousePointerClickIcon className="size-4" />
          Button
        </Button>
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
 * renderer can actually honour — the font list is the Windows-stock set, because a webfont would
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
  const buttonCount = layout.elements.filter((candidate) => candidate.type === "button").length

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
    return (
      <div className="flex flex-col gap-3">
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

  // The last button is the kiosk user's only way to close the overlay, so removing it is blocked
  // here rather than silently repaired at render time.
  const isLastButton = element.type === "button" && buttonCount === 1

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
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={remove}
            disabled={isLastButton}
            aria-label="Delete element"
            className="text-destructive hover:bg-destructive/10 hover:text-destructive"
          >
            <Trash2Icon className="size-3.5" />
          </Button>
        </div>
      </div>

      {isLastButton && (
        <p className="text-xs text-muted-foreground">
          This is the only button on the canvas. Kiosk users need one to dismiss the announcement,
          so it can&apos;t be deleted.
        </p>
      )}

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
        </>
      )}

      {element.type === "shape" && (
        <>
          <ColorField
            label="Fill"
            id="ann-el-fill"
            value={element.fill}
            onChange={(fill) => update({ fill })}
          />
          <NumberField
            label="Corner radius"
            id="ann-el-shape-radius"
            value={element.radius}
            onChange={(radius) => update({ radius })}
            min={0}
          />
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
