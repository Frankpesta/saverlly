import * as React from "react"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { DateField, digitsFromDate, digitsOf, formatDigits, parseDigits } from "./date-field"

describe("date mask helpers", () => {
  it("formats a digit buffer progressively", () => {
    expect(formatDigits("")).toBe("")
    expect(formatDigits("0")).toBe("0")
    expect(formatDigits("01")).toBe("01")
    expect(formatDigits("010")).toBe("01/0")
    expect(formatDigits("0101")).toBe("01/01")
    expect(formatDigits("01012030")).toBe("01/01/2030")
  })

  it("ignores anything past eight digits", () => {
    expect(formatDigits("0101203099")).toBe("01/01/2030")
    expect(digitsOf("01/01/2030")).toBe("01012030")
    expect(digitsOf("abc1-2/3")).toBe("123")
  })

  it("only parses complete, real calendar dates", () => {
    expect(parseDigits("0101203")).toBeUndefined()
    expect(parseDigits("13012030")).toBeUndefined() // month 13
    expect(parseDigits("02312030")).toBeUndefined() // 31 February
    expect(parseDigits("02292024")).toEqual(new Date(2024, 1, 29)) // leap year is real
    expect(parseDigits("01012030")).toEqual(new Date(2030, 0, 1))
  })

  it("round-trips a date through the buffer", () => {
    expect(digitsFromDate(new Date(2030, 0, 1))).toBe("01012030")
    expect(parseDigits(digitsFromDate(new Date(2026, 11, 25)))).toEqual(new Date(2026, 11, 25))
  })
})

function Harness({ onCommit }: { onCommit?: (d: Date | undefined) => void }) {
  const [digits, setDigits] = React.useState("")
  return <DateField aria-label="Date" value={digits} onChange={setDigits} onCommit={onCommit} />
}

describe("DateField", () => {
  it("auto-formats eight bare digits as they are typed", async () => {
    const user = userEvent.setup()
    const onCommit = jest.fn()
    render(<Harness onCommit={onCommit} />)
    const input = screen.getByLabelText("Date")

    await user.click(input)
    await user.keyboard("01012030")

    // This is the client's literal request: type 01012030, get 01/01/2030.
    expect(input).toHaveValue("01/01/2030")
    expect(onCommit).toHaveBeenLastCalledWith(new Date(2030, 0, 1))
  })

  it("shows the separators mid-way through typing", async () => {
    const user = userEvent.setup()
    render(<Harness />)
    const input = screen.getByLabelText("Date")

    await user.click(input)
    await user.keyboard("0101")
    expect(input).toHaveValue("01/01")
  })

  it("does not commit an impossible date", async () => {
    const user = userEvent.setup()
    const onCommit = jest.fn()
    render(<Harness onCommit={onCommit} />)

    await user.click(screen.getByLabelText("Date"))
    await user.keyboard("02312030")

    expect(onCommit).toHaveBeenLastCalledWith(undefined)
  })

  it("deletes digits cleanly across a separator", async () => {
    const user = userEvent.setup()
    render(<Harness />)
    const input = screen.getByLabelText("Date")

    await user.click(input)
    await user.keyboard("01012030")
    await user.keyboard("{Backspace>5/}")

    // Five digits removed from 01012030 leaves 010, which renders as a partial month/day.
    expect(input).toHaveValue("01/0")
  })
})
