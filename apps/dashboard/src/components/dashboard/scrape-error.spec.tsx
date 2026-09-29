import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { ScrapeError } from "./scrape-error"

it("shows one truncated line and reveals each failure on click", async () => {
  const user = userEvent.setup()
  render(
    <ScrapeError message="SimplyCodes scrape incomplete: saved 0 code(s); offer=1: timed out" />,
  )
  expect(
    screen.getByText("Failed: SimplyCodes scrape incomplete: saved 0 code(s); offer=1: timed out"),
  ).toHaveClass("truncate")
  expect(screen.queryByText("offer=1: timed out")).not.toBeInTheDocument()
  await user.click(screen.getByRole("button", { name: "Show full error" }))
  expect(await screen.findByText("offer=1: timed out")).toBeInTheDocument()
  expect(screen.getByText("SimplyCodes scrape incomplete: saved 0 code(s)")).toBeInTheDocument()
})
