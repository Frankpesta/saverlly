import * as React from "react"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { useForm, useWatch } from "react-hook-form"
import { CityStateFields } from "./city-state-fields"

type Values = { city: string; state: string }

function Harness() {
  const { control } = useForm<Values>({ defaultValues: { city: "", state: "" } })
  const [city, state] = useWatch({ control, name: ["city", "state"] })
  return (
    <>
      <CityStateFields idPrefix="t" control={control} cityName="city" stateName="state" />
      <output data-testid="values">{`${city}|${state}`}</output>
    </>
  )
}

async function pick(user: ReturnType<typeof userEvent.setup>, field: "State" | "City", search: string, option: string) {
  await user.click(screen.getByRole("combobox", { name: field }))
  await user.type(screen.getByPlaceholderText(field === "State" ? "Search states..." : "Type a city..."), search)
  await user.click(await screen.findByRole("option", { name: option }))
}

const values = () => screen.getByTestId("values").textContent

describe("CityStateFields: changing a choice", () => {
  it("can switch to a different state after both are chosen, clearing a city that isn't there", async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await pick(user, "State", "Texas", "Texas (TX)")
    await pick(user, "City", "Austin", "Austin")
    expect(values()).toBe("Austin|TX")

    // Austin also exists in Minnesota, but every state must still be offered, not just those.
    await pick(user, "State", "California", "California (CA)")
    expect(values()).toBe("|CA")
  })

  it("keeps the city when the new state also has a city by that name", async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await pick(user, "State", "Illinois", "Illinois (IL)")
    await pick(user, "City", "Springfield", "Springfield")
    await pick(user, "State", "Missouri", "Missouri (MO)")
    expect(values()).toBe("Springfield|MO")
  })

  it("can switch to another city in the same state", async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await pick(user, "State", "Texas", "Texas (TX)")
    await pick(user, "City", "Austin", "Austin")
    await pick(user, "City", "Dallas", "Dallas")
    expect(values()).toBe("Dallas|TX")
  })

  it("moves State along when a typed city only exists in another state", async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await pick(user, "State", "Texas", "Texas (TX)")
    await pick(user, "City", "Los Angeles", "Use “Los Angeles”")
    expect(values()).toBe("Los Angeles|CA")
  })
})
