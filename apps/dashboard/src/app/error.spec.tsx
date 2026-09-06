import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import ErrorBoundary from "./error"

describe("root error boundary", () => {
  it("renders a fallback message and calls reset() when 'Try again' is clicked", async () => {
    const reset = jest.fn()
    render(<ErrorBoundary error={new Error("boom")} reset={reset} />)

    expect(screen.getByText("Something went wrong")).toBeInTheDocument()

    await userEvent.click(screen.getByRole("button", { name: "Try again" }))
    expect(reset).toHaveBeenCalledTimes(1)
  })

  it("links back to the dashboard", () => {
    const reset = jest.fn()
    render(<ErrorBoundary error={new Error("boom")} reset={reset} />)

    expect(screen.getByRole("link", { name: "Go to dashboard" })).toHaveAttribute(
      "href",
      expect.stringMatching(/^\/(admin|portal)\/overview$/),
    )
  })
})
