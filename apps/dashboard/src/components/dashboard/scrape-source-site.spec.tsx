import { render, screen } from "@testing-library/react"
import { ScrapeSourceStatusBadge } from "./scrape-source-site"

describe("ScrapeSourceStatusBadge", () => {
  it("flags a source that failed 5 runs in a row, ahead of its site status", () => {
    render(<ScrapeSourceStatusBadge source={{ status: "BLOCKED", consecutiveFailures: 5 }} />)
    expect(screen.getByText("Failing")).toBeInTheDocument()
    expect(screen.queryByText("Blocked")).not.toBeInTheDocument()
  })

  it("shows the site status below the threshold, and nothing when all is well", () => {
    const { rerender, container } = render(
      <ScrapeSourceStatusBadge source={{ status: "BLOCKED", consecutiveFailures: 4 }} />,
    )
    expect(screen.getByText("Blocked")).toBeInTheDocument()
    rerender(<ScrapeSourceStatusBadge source={{ status: "ACTIVE", consecutiveFailures: 0 }} />)
    expect(container).toBeEmptyDOMElement()
  })
})
