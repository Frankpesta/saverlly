import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import ScrapeSourcesPage from "./page"
import type { CouponSiteHealth } from "@saverlly/shared-types"
import type { Merchant, ScrapeSource } from "@/lib/api/types"

const merchants: Merchant[] = [
  {
    id: "m-1",
    name: "Amazon",
    domain: "amazon.com",
    attributionMethod: "COOKIE",
    affiliateTrackingUrl: "https://amazon.com/?ref=saverlly",
    affiliateUrlParamKey: null,
    affiliateUrlParamValue: null,
    affiliateProgramId: null,
    active: true,
    checkoutRecipe: null,
    createdAt: "2026-01-01T00:00:00.000Z",
  },
]

const scrapeSources: ScrapeSource[] = [
  {
    id: "s-1",
    url: "https://amazon.com/coupons",
    merchantId: "m-1",
    strategy: "GENERIC_CSS",
    status: "ACTIVE",
    nextRunAt: null,
    consecutiveFailures: 0,
    consecutiveBlocks: 0,
    autoCreated: false,
    selectorConfig: { codeSelector: ".coupon-code" },
    intervalMinutes: 1440,
    lastRunAt: null,
    active: true,
  },
  {
    id: "s-2",
    url: "https://unassigned.com/coupons",
    merchantId: null,
    strategy: "GENERIC_CSS",
    status: "ACTIVE",
    nextRunAt: null,
    consecutiveFailures: 0,
    consecutiveBlocks: 0,
    autoCreated: false,
    selectorConfig: { codeSelector: ".code" },
    intervalMinutes: 720,
    lastRunAt: null,
    active: false,
  },
]

const sites: CouponSiteHealth[] = [
  {
    strategy: "SIMPLYCODES",
    label: "SimplyCodes",
    runs: { succeeded: 2, blocked: 9, notListed: 0, failed: 0 },
    codesFound: 11,
    lastSucceededAt: "2026-11-17T08:00:00.000Z",
    pausedUntil: new Date(Date.now() + 5 * 3_600_000).toISOString(),
  },
  {
    strategy: "COUPONFOLLOW",
    label: "CouponFollow",
    runs: { succeeded: 40, blocked: 0, notListed: 3, failed: 1 },
    codesFound: 212,
    lastSucceededAt: null,
    pausedUntil: null,
  },
]

function renderWithClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>)
}

describe("ScrapeSourcesPage", () => {
  beforeEach(() => {
    global.fetch = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      const method = init?.method ?? "GET"

      if (url === "/api/proxy/scrape-sources" && method === "GET") {
        return { ok: true, status: 200, json: async () => scrapeSources } as Response
      }
      if (url === "/api/proxy/merchants" && method === "GET") {
        return { ok: true, status: 200, json: async () => merchants } as Response
      }
      if (url === "/api/proxy/scrape-sources/sites" && method === "GET") {
        return { ok: true, status: 200, json: async () => sites } as Response
      }
      if (url === "/api/proxy/scrape-sources/backfill" && method === "POST") {
        return { ok: true, status: 201, json: async () => ({ merchants: 4, created: 7 }) } as Response
      }
      if (url === "/api/proxy/scrape-sources/s-2/run-now" && method === "POST") {
        return { ok: true, status: 201, json: async () => ({ queued: true }) } as Response
      }

      throw new Error(`Unhandled fetch in test: ${method} ${url}`)
    }) as jest.Mock
  })

  it("resolves the assigned merchant and shows unassigned sources distinctly", async () => {
    renderWithClient(<ScrapeSourcesPage />)

    expect(await screen.findByText("Amazon")).toBeInTheDocument()
    expect(screen.getByText("Unassigned")).toBeInTheDocument()
  })

  it("queues a manual run", async () => {
    const user = userEvent.setup()
    renderWithClient(<ScrapeSourcesPage />)

    await screen.findByText("Unassigned")
    const runButtons = screen.getAllByRole("button", { name: /run now/i })
    await user.click(runButtons[1])

    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/proxy/scrape-sources/s-2/run-now",
        expect.objectContaining({ method: "POST" }),
      ),
    )
  })

  it("sets up coupon sites for every merchant in one click", async () => {
    const user = userEvent.setup()
    renderWithClient(<ScrapeSourcesPage />)

    await user.click(
      await screen.findByRole("button", { name: /set up coupon sites for all merchants/i }),
    )

    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/proxy/scrape-sources/backfill",
        expect.objectContaining({ method: "POST" }),
      ),
    )
  })

  it("shows how each coupon site did over the last day, and a paused site", async () => {
    renderWithClient(<ScrapeSourcesPage />)

    const simply = (await screen.findByText("SimplyCodes")).closest("tr")!
    expect(within(simply).getByText("9")).toBeInTheDocument()
    expect(within(simply).getByText("11")).toBeInTheDocument()
    expect(within(simply).getByText(/^Paused for/)).toBeInTheDocument()

    const follow = screen.getByText("CouponFollow").closest("tr")!
    expect(within(follow).getByText("212")).toBeInTheDocument()
    expect(within(follow).getByText("Never")).toBeInTheDocument()
    expect(within(follow).queryByText(/^Paused/)).not.toBeInTheDocument()
  })
})
