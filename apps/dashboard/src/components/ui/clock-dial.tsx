"use client"

import * as React from "react"
import { cn } from "@/lib/utils"
import type { Period } from "@/components/ui/time-field"

/* An analog clock face with a draggable hand.
 *
 * Replaces three side-by-side scrolling columns of ghost buttons, which is what the client
 * said they did not like the look of. Those columns also quantised minutes to 0/15/30/45 while
 * typing allowed any minute, so the two input paths disagreed; the dial has no such limit.
 *
 * Hand-built SVG, same no-new-dependency approach as gauge.tsx and meter.tsx. */

const SIZE = 232
const CENTRE = SIZE / 2
const RADIUS = SIZE / 2 - 24

type DialMode = "hour" | "minute"

/** Screen angle for a value, measured clockwise from 12 o'clock. */
function pointFor(value: number, stepsPerTurn: number, radius: number) {
  const angle = (value / stepsPerTurn) * 2 * Math.PI - Math.PI / 2
  return { x: CENTRE + Math.cos(angle) * radius, y: CENTRE + Math.sin(angle) * radius }
}

/** Inverse of pointFor: which tick is the pointer nearest to. */
function valueFromPoint(x: number, y: number, stepsPerTurn: number) {
  const angle = Math.atan2(y - CENTRE, x - CENTRE) + Math.PI / 2
  const turns = (angle / (2 * Math.PI) + 1) % 1
  return Math.round(turns * stepsPerTurn) % stepsPerTurn
}

export function ClockDial({
  hour12,
  minute,
  period,
  onChange,
  minuteStep = 1,
  className,
}: {
  /** 1 to 12. */
  hour12: number
  /** 0 to 59. */
  minute: number
  period: Period
  onChange: (next: { hour12: number; minute: number; period: Period }) => void
  /** Snap interval for the minute hand. Typing is always free-form regardless. */
  minuteStep?: number
  className?: string
}) {
  const [mode, setMode] = React.useState<DialMode>("hour")
  const svgRef = React.useRef<SVGSVGElement>(null)
  const dragging = React.useRef(false)

  function readPointer(event: React.PointerEvent | PointerEvent) {
    const svg = svgRef.current
    if (!svg) return null
    const rect = svg.getBoundingClientRect()
    // The SVG is scaled to its box, so map client pixels back into viewBox units.
    const x = ((event.clientX - rect.left) / rect.width) * SIZE
    const y = ((event.clientY - rect.top) / rect.height) * SIZE
    return { x, y }
  }

  function applyFromPointer(event: React.PointerEvent | PointerEvent) {
    const point = readPointer(event)
    if (!point) return
    if (mode === "hour") {
      const tick = valueFromPoint(point.x, point.y, 12)
      onChange({ hour12: tick === 0 ? 12 : tick, minute, period })
    } else {
      const tick = valueFromPoint(point.x, point.y, 60)
      const snapped = (Math.round(tick / minuteStep) * minuteStep) % 60
      onChange({ hour12, minute: snapped, period })
    }
  }

  // Release can happen anywhere on the page, so it is caught on the window rather than the svg.
  React.useEffect(() => {
    function move(event: PointerEvent) {
      if (dragging.current) applyFromPointer(event)
    }
    function up() {
      if (!dragging.current) return
      dragging.current = false
      // Setting the hour advances to the minute hand, the same two-step flow as a phone
      // clock picker. Minute selection is terminal.
      setMode((current) => (current === "hour" ? "minute" : current))
    }
    window.addEventListener("pointermove", move)
    window.addEventListener("pointerup", up)
    window.addEventListener("pointercancel", up)
    return () => {
      window.removeEventListener("pointermove", move)
      window.removeEventListener("pointerup", up)
      window.removeEventListener("pointercancel", up)
    }
  })

  const handValue = mode === "hour" ? hour12 % 12 : minute
  const stepsPerTurn = mode === "hour" ? 12 : 60
  const handEnd = pointFor(handValue, stepsPerTurn, RADIUS)

  return (
    <div className={cn("flex flex-col items-center gap-3", className)}>
      {/* Which hand you are setting, and a way back to the hour. */}
      <div className="flex items-center gap-1 text-title tabular-nums">
        <button
          type="button"
          onClick={() => setMode("hour")}
          className={cn(
            "rounded-md px-1.5 transition-colors",
            mode === "hour" ? "text-foreground" : "text-muted-foreground hover:text-foreground",
          )}
          aria-label="Set hour"
          aria-pressed={mode === "hour"}
        >
          {String(hour12).padStart(2, "0")}
        </button>
        <span className="text-muted-foreground">:</span>
        <button
          type="button"
          onClick={() => setMode("minute")}
          className={cn(
            "rounded-md px-1.5 transition-colors",
            mode === "minute" ? "text-foreground" : "text-muted-foreground hover:text-foreground",
          )}
          aria-label="Set minute"
          aria-pressed={mode === "minute"}
        >
          {String(minute).padStart(2, "0")}
        </button>

        <div className="ml-2 flex overflow-hidden rounded-lg border border-input text-label">
          {(["AM", "PM"] as const).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => onChange({ hour12, minute, period: option })}
              aria-pressed={period === option}
              className={cn(
                "px-2 py-1 transition-colors",
                period === option
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              {option}
            </button>
          ))}
        </div>
      </div>

      <svg
        ref={svgRef}
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        width={SIZE}
        height={SIZE}
        className="touch-none select-none"
        role="application"
        aria-label={mode === "hour" ? "Hour dial" : "Minute dial"}
        onPointerDown={(event) => {
          dragging.current = true
          event.currentTarget.setPointerCapture?.(event.pointerId)
          applyFromPointer(event)
        }}
      >
        <circle cx={CENTRE} cy={CENTRE} r={CENTRE - 4} className="fill-muted" />

        {/* Hand drawn under the labels so a selected number stays readable on the teal disc. */}
        <line
          x1={CENTRE}
          y1={CENTRE}
          x2={handEnd.x}
          y2={handEnd.y}
          stroke="var(--brand-teal)"
          strokeWidth={2}
          strokeLinecap="round"
        />
        <circle cx={handEnd.x} cy={handEnd.y} r={17} fill="var(--brand-teal)" />
        <circle cx={CENTRE} cy={CENTRE} r={3.5} fill="var(--brand-teal)" />

        {mode === "hour"
          ? Array.from({ length: 12 }, (_, i) => i + 1).map((h) => {
              const at = pointFor(h % 12, 12, RADIUS)
              const active = h === hour12
              return (
                <text
                  key={h}
                  x={at.x}
                  y={at.y}
                  textAnchor="middle"
                  dominantBaseline="central"
                  className={cn(
                    "pointer-events-none text-[13px] tabular-nums",
                    active ? "fill-[var(--primary-foreground)] font-semibold" : "fill-foreground",
                  )}
                >
                  {h}
                </text>
              )
            })
          : Array.from({ length: 12 }, (_, i) => i * 5).map((m) => {
              const at = pointFor(m, 60, RADIUS)
              const active = m === minute
              return (
                <text
                  key={m}
                  x={at.x}
                  y={at.y}
                  textAnchor="middle"
                  dominantBaseline="central"
                  className={cn(
                    "pointer-events-none text-[13px] tabular-nums",
                    active ? "fill-[var(--primary-foreground)] font-semibold" : "fill-foreground",
                  )}
                >
                  {String(m).padStart(2, "0")}
                </text>
              )
            })}

        {/* When the minute is not on a multiple of five there is no label under the hand, so
            the exact value is shown on the knob instead. */}
        {mode === "minute" && minute % 5 !== 0 && (
          <text
            x={handEnd.x}
            y={handEnd.y}
            textAnchor="middle"
            dominantBaseline="central"
            className="pointer-events-none fill-[var(--primary-foreground)] text-[13px] font-semibold tabular-nums"
          >
            {String(minute).padStart(2, "0")}
          </text>
        )}
      </svg>
    </div>
  )
}
