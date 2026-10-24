import * as React from "react"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { Combobox } from "./combobox"

// Alphabetical, like the city list. Under a plain "contains" match capped at 50, the many
// "Anew…" rows would fill the list before "New York" was ever reached.
const OPTIONS = [
  ...Array.from({ length: 60 }, (_, i) => `Anew ${String(i).padStart(2, "0")}`),
  "New York",
  "Newark",
].map((city) => ({ value: city, label: city }))

function Harness({ initial = "" }: { initial?: string }) {
  const [value, setValue] = React.useState(initial)
  return (
    <>
      <Combobox
        id="city"
        aria-label="City"
        value={value}
        onValueChange={setValue}
        options={OPTIONS}
        placeholder="Select or type a city"
        allowCustomValue
      />
      <output data-testid="value">{value}</output>
    </>
  )
}

describe("Combobox with allowCustomValue", () => {
  it("lists matches that start with the typed text first", async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.click(screen.getByRole("combobox", { name: "City" }))
    await user.type(screen.getByRole("combobox", { name: "" }), "new")
    const rows = screen.getAllByRole("option").map((row) => row.textContent)
    expect(rows.slice(0, 2)).toEqual(["New York", "Newark"])
  })

  it("offers typed text as an explicit choice and shows it once chosen", async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.click(screen.getByRole("combobox", { name: "City" }))
    await user.type(screen.getByRole("combobox", { name: "" }), "Smallville")
    await user.click(screen.getByRole("option", { name: /Use .Smallville./ }))
    expect(screen.getByTestId("value")).toHaveTextContent("Smallville")
    expect(screen.getByRole("combobox", { name: "City" })).toHaveTextContent("Smallville")
  })

  it("does not save half-typed text just because the list was closed", async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.click(screen.getByRole("combobox", { name: "City" }))
    await user.type(screen.getByRole("combobox", { name: "" }), "Aus")
    await user.keyboard("{Escape}")
    expect(screen.getByTestId("value")).toBeEmptyDOMElement()
  })

  it("shows a saved value that isn't one of the options instead of the placeholder", () => {
    render(<Harness initial="Smallville" />)
    expect(screen.getByRole("combobox", { name: "City" })).toHaveTextContent("Smallville")
  })
})
