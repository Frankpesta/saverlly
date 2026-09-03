import * as React from "react"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import {
  TimeField,
  formatTimeDigits,
  timeDigitsToValue,
  valueToTimeDigits,
  type Period,
} from "./time-field"

describe("time mask helpers", () => {
  it("formats a digit buffer progressively", () => {
    expect(formatTimeDigits("", null)).toBe("")
    expect(formatTimeDigits("03", null)).toBe("03")
    expect(formatTimeDigits("033", null)).toBe("03:3")
    expect(formatTimeDigits("0330", "PM")).toBe("03:30 PM")
  })

  it("converts to and from the 24-hour value shape", () => {
    expect(timeDigitsToValue("0330", "PM")).toBe("15:30")
    expect(timeDigitsToValue("1230", "AM")).toBe("00:30")
    expect(timeDigitsToValue("1230", "PM")).toBe("12:30")
    expect(valueToTimeDigits("15:30")).toEqual({ digits: "0330", period: "PM" })
    expect(valueToTimeDigits("00:05")).toEqual({ digits: "1205", period: "AM" })
  })

  it("rejects incomplete or out-of-range input", () => {
    expect(timeDigitsToValue("033", "PM")).toBeUndefined()
    expect(timeDigitsToValue("1330", "PM")).toBeUndefined() // 13 is not a 12-hour hour
    expect(timeDigitsToValue("0399", "AM")).toBeUndefined() // 99 minutes
  })

  it("round-trips every minute of the day", () => {
    for (let total = 0; total < 24 * 60; total += 1) {
      const value = `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`
      const { digits, period } = valueToTimeDigits(value)
      expect(timeDigitsToValue(digits, period)).toBe(value)
    }
  })
})

function Harness({ onChange }: { onChange?: (v: string | undefined) => void }) {
  const [state, setState] = React.useState<{ digits: string; period: Period | null }>({
    digits: "",
    period: null,
  })
  return (
    <TimeField
      digits={state.digits}
      period={state.period}
      onChange={(next) => {
        setState(next)
        onChange?.(timeDigitsToValue(next.digits, next.period))
      }}
    />
  )
}

describe("TimeField", () => {
  it("types 0330p as 03:30 PM", async () => {
    const user = userEvent.setup()
    const onChange = jest.fn()
    render(<Harness onChange={onChange} />)
    const input = screen.getByLabelText("Time")

    await user.click(input)
    await user.keyboard("0330p")

    expect(input).toHaveValue("03:30 PM")
    expect(onChange).toHaveBeenLastCalledWith("15:30")
  })

  it("accepts any minute, not just quarter hours", async () => {
    const user = userEvent.setup()
    const onChange = jest.fn()
    render(<Harness onChange={onChange} />)

    await user.click(screen.getByLabelText("Time"))
    await user.keyboard("0947a")

    expect(onChange).toHaveBeenLastCalledWith("09:47")
  })

  it("steps the hour with the arrow keys", async () => {
    const user = userEvent.setup()
    const onChange = jest.fn()
    render(<Harness onChange={onChange} />)
    const input = screen.getByLabelText("Time")

    await user.click(input)
    await user.keyboard("1000a")
    expect(onChange).toHaveBeenLastCalledWith("10:00")

    await user.keyboard("{Home}{ArrowUp}")
    expect(onChange).toHaveBeenLastCalledWith("11:00")
  })
})
