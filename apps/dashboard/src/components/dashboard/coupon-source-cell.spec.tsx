import { render, screen } from "@testing-library/react"
import { CouponSourceCell } from "./coupon-source-cell"

describe("CouponSourceCell", () => {
  it("lists the coupon sites that saw the code, once each", () => {
    render(
      <CouponSourceCell
        coupon={{
          source: "SCRAPE",
          sightings: [
            { strategy: "SIMPLYCODES", lastSeenAt: "2026-11-17T00:00:00.000Z" },
            { strategy: "COUPONFOLLOW", lastSeenAt: "2026-11-16T00:00:00.000Z" },
            { strategy: "GENERIC_CSS", lastSeenAt: "2026-11-15T00:00:00.000Z" },
          ],
        }}
      />,
    )
    expect(screen.getByText("SCRAPE")).toBeInTheDocument()
    expect(screen.getByText("SimplyCodes · CouponFollow · Custom page")).toBeInTheDocument()
  })

  it("shows only the source when no site has seen it", () => {
    const { container } = render(<CouponSourceCell coupon={{ source: "MANUAL" }} />)
    expect(screen.getByText("MANUAL")).toBeInTheDocument()
    expect(container.querySelectorAll("span")).toHaveLength(1)
  })
})
