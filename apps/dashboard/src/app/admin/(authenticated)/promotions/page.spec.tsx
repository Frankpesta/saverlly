import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import AdminPromotionsPage from "./page"
import { promotionStatus, targetingSummary } from "./promotion-status"
import type { Promotion } from "@/lib/api/types"

const NOW = new Date("2026-06-15T12:00:00.000Z").getTime()

function makePromotion(overrides: Partial<Promotion> = {}): Promotion {
  return {
    id: "promo-1",
    name: "Summer Sale",
    imageSmallUrl: "https://cdn.example.com/small.png",
    imageLargeUrl: "https://cdn.example.com/large.png",
    clickUrl: "https://example.com/summer",
    targetTags: ["mall"],
    locationIds: [],
    startAt: "2026-06-01T00:00:00.000Z",
    endAt: "2026-07-01T00:00:00.000Z",
    active: true,
    createdAt: "2026-05-01T00:00:00.000Z",
    updatedAt: "2026-05-01T00:00:00.000Z",
    ...overrides,
  }
}

const live = makePromotion()
const scheduled = makePromotion({
  id: "promo-2",
  name: "Fall Promo",
  startAt: "2026-09-01T00:00:00.000Z",
  endAt: "2026-10-01T00:00:00.000Z",
  targetTags: [],
  locationIds: [],
})
const paused = makePromotion({ id: "promo-3", name: "Paused Promo", active: false })

function renderWithClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>)
}

describe("promotionStatus", () => {
  it("treats the manual kill switch as beating the schedule window", () => {
    // Dates say it's running; `active: false` must still win, otherwise the gallery would
    // show a paused promotion as Live.
    expect(promotionStatus(paused, NOW)).toBe("Paused")
    expect(promotionStatus(live, NOW)).toBe("Live")
    expect(promotionStatus(scheduled, NOW)).toBe("Scheduled")
    expect(promotionStatus(makePromotion({ endAt: "2026-06-02T00:00:00.000Z" }), NOW)).toBe("Ended")
  })
})

describe("targetingSummary", () => {
  it("describes an untargeted promotion as reaching everywhere", () => {
    expect(targetingSummary(makePromotion({ targetTags: [], locationIds: [] }))).toBe("Everywhere")
  })

  it("combines tags and locations as a union, not an intersection", () => {
    expect(
      targetingSummary(makePromotion({ targetTags: ["mall", "airport"], locationIds: ["a", "b"] })),
    ).toBe("mall, airport · 2 locations")
  })
})

describe("AdminPromotionsPage", () => {
  beforeEach(() => {
    jest.useFakeTimers({ now: NOW, doNotFake: ["queueMicrotask"] })
    global.fetch = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      const method = init?.method ?? "GET"

      if (url === "/api/proxy/promotions" && method === "GET") {
        return { ok: true, status: 200, json: async () => [live, scheduled, paused] } as Response
      }
      if (url === "/api/proxy/promotions/promo-3" && method === "PATCH") {
        return { ok: true, status: 200, json: async () => ({ ...paused, active: true }) } as Response
      }
      throw new Error(`Unhandled fetch in test: ${method} ${url}`)
    }) as jest.Mock
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  it("renders every promotion with its derived status", async () => {
    renderWithClient(<AdminPromotionsPage />)

    expect(await screen.findByText("Summer Sale")).toBeInTheDocument()
    expect(screen.getByText("Fall Promo")).toBeInTheDocument()
    expect(screen.getByText("Paused Promo")).toBeInTheDocument()

    // Each status label appears twice. Once as a filter tab, once as a card badge. The filter
    // tabs are buttons, so anything outside a button is the card's own status badge.
    for (const status of ["Live", "Scheduled", "Paused"]) {
      const badges = screen.getAllByText(status).filter((el) => el.closest("button") === null)
      expect(badges).toHaveLength(1)
    }
  })

  it("filters the gallery down to one status", async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime })
    renderWithClient(<AdminPromotionsPage />)

    await screen.findByText("Summer Sale")
    await user.click(screen.getByRole("button", { name: /^Live/ }))

    expect(screen.getByText("Summer Sale")).toBeInTheDocument()
    expect(screen.queryByText("Fall Promo")).not.toBeInTheDocument()
    expect(screen.queryByText("Paused Promo")).not.toBeInTheDocument()
  })

  it("shows the empty state, pointing at the extension slot a promotion fills", async () => {
    ;(global.fetch as jest.Mock).mockImplementation(async () => ({
      ok: true,
      status: 200,
      json: async () => [],
    }))
    renderWithClient(<AdminPromotionsPage />)

    expect(await screen.findByText("No promotions yet")).toBeInTheDocument()
    // The popup mock is the point of this empty state. It must actually render, not just copy.
    expect(screen.getByText(/320 × 100 creative/)).toBeInTheDocument()
    expect(screen.getByText("Sponsored")).toBeInTheDocument()
    expect(
      screen.getByRole("link", { name: /create your first promotion/i }),
    ).toHaveAttribute("href", "/admin/promotions/new")
  })

  it("resumes a paused promotion from its card", async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime })
    renderWithClient(<AdminPromotionsPage />)

    await screen.findByText("Paused Promo")
    await user.click(screen.getByRole("button", { name: "Resume Paused Promo" }))

    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/proxy/promotions/promo-3",
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({ active: true }),
        }),
      ),
    )
  })
})
