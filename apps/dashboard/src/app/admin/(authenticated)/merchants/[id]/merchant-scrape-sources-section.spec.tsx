import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { MerchantScrapeSourcesSection } from "./merchant-scrape-sources-section"
import type { ScrapeSource } from "@/lib/api/types"

const base = {
  merchantId: "m-1",
  selectorConfig: null,
  intervalMinutes: 1440,
  nextRunAt: null,
  consecutiveFailures: 0,
  autoCreated: true,
  lastRunAt: null,
  active: true,
}

const sources: ScrapeSource[] = [
  {
    ...base,
    id: "s-simply",
    strategy: "SIMPLYCODES",
    url: "https://simplycodes.com/store/allbirds.com",
    status: "NOT_LISTED",
  },
  {
    ...base,
    id: "s-custom",
    strategy: "GENERIC_CSS",
    url: "https://allbirds.com/deals",
    selectorConfig: { codeSelector: ".code" },
    status: "ACTIVE",
    autoCreated: false,
  },
  // Another merchant's source never shows here.
  {
    ...base,
    id: "s-other",
    merchantId: "m-2",
    strategy: "COUPONFOLLOW",
    url: "https://couponfollow.com/site/other.com",
    status: "ACTIVE",
  },
]

function renderSection() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <MerchantScrapeSourcesSection merchantId="m-1" />
    </QueryClientProvider>,
  )
}

describe("MerchantScrapeSourcesSection", () => {
  beforeEach(() => {
    global.fetch = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      const method = init?.method ?? "GET"
      if (url === "/api/proxy/scrape-sources" && method === "GET")
        return { ok: true, status: 200, json: async () => sources } as Response
      if (method === "POST" || method === "PATCH")
        return { ok: true, status: 201, json: async () => ({}) } as Response
      throw new Error(`Unhandled fetch in test: ${method} ${url}`)
    }) as jest.Mock
  })

  it("shows one row per coupon site, then custom pages", async () => {
    renderSection()

    const simply = (await screen.findByText("SimplyCodes")).closest("tr")!
    expect(within(simply).getByText("Not listed")).toBeInTheDocument()
    expect(within(simply).getByRole("button", { name: "Check now" })).toBeInTheDocument()

    const follow = screen.getByText("CouponFollow").closest("tr")!
    expect(within(follow).getByText("Not set up for this merchant.")).toBeInTheDocument()

    expect(screen.getByText("Custom")).toBeInTheDocument()
    expect(screen.getByText("https://allbirds.com/deals")).toBeInTheDocument()
    expect(screen.queryByText("https://couponfollow.com/site/other.com")).not.toBeInTheDocument()
  })

  it("adds a missing coupon site and switches one off", async () => {
    const user = userEvent.setup()
    renderSection()

    const follow = (await screen.findByText("CouponFollow")).closest("tr")!
    await user.click(within(follow).getByRole("button", { name: "Add" }))
    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/proxy/scrape-sources",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ strategy: "COUPONFOLLOW", merchantId: "m-1" }),
        }),
      ),
    )

    await user.click(screen.getByRole("switch", { name: "Toggle SimplyCodes source" }))
    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/proxy/scrape-sources/s-simply",
        expect.objectContaining({ method: "PATCH", body: JSON.stringify({ active: false }) }),
      ),
    )
  })
})
