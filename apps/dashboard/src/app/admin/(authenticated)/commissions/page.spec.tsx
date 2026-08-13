import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import AdminCommissionsPage from "./page"
import { formatCurrency } from "@/lib/format-currency"
import type { CommissionEvent, Device, Kiosk, Location, Merchant } from "@/lib/api/types"

const kiosks: Kiosk[] = [
  {
    id: "kiosk-1",
    name: "Kiosk One",
    status: "ACTIVE",
    revenueSharePct: "30",
    contactEmail: "owner1@example.com",
    stripeAccountId: null,
    stripePayoutsEnabled: false,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
]

const locations: Location[] = [
  {
    id: "loc-1",
    kioskId: "kiosk-1",
    name: "Lagos Central",
    address: "1 Main St",
    city: "Lagos",
    state: "Lagos",
    country: "Nigeria",
    latitude: null,
    longitude: null,
    tags: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
]

const devices: Device[] = [
  {
    id: "dev-1",
    locationId: "loc-1",
    label: "KSK-001",
    active: true,
    localDeviceIdentifier: null,
    osVersion: null,
    lastSeenAt: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
]

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

const events: CommissionEvent[] = [
  {
    id: "ev-1",
    deviceId: "dev-1",
    merchantId: "m-1",
    couponId: null,
    networkReference: "ref-1",
    orderValue: 5000,
    commissionAmount: 1000,
    kioskShareAmount: 300,
    status: "CONFIRMED",
    reportedAt: "2026-01-05T00:00:00.000Z",
    confirmedAt: "2026-01-05T00:00:00.000Z",
    reversedAt: null,
    payoutId: null,
  },
]

function renderWithClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>)
}

describe("AdminCommissionsPage", () => {
  beforeEach(() => {
    global.fetch = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      const method = init?.method ?? "GET"

      if (url.startsWith("/api/proxy/commission-events") && method === "GET") {
        return { ok: true, status: 200, json: async () => events } as Response
      }
      if (url === "/api/proxy/commission-events/sync-now" && method === "POST") {
        return { ok: true, status: 200, json: async () => ({ ingested: 2, confirmed: 1, reversed: 0 }) } as Response
      }
      if (url === "/api/proxy/kiosks") return { ok: true, status: 200, json: async () => kiosks } as Response
      if (url === "/api/proxy/locations") return { ok: true, status: 200, json: async () => locations } as Response
      if (url === "/api/proxy/devices") return { ok: true, status: 200, json: async () => devices } as Response
      if (url === "/api/proxy/merchants") return { ok: true, status: 200, json: async () => merchants } as Response

      throw new Error(`Unhandled fetch in test: ${method} ${url}`)
    }) as jest.Mock
  })

  it("resolves merchant and kiosk names for each row", async () => {
    renderWithClient(<AdminCommissionsPage />)

    const merchantCell = await screen.findByText("Amazon")
    expect(screen.getByText("Kiosk One")).toBeInTheDocument()
    const row = merchantCell.closest("tr") as HTMLElement
    expect(within(row).getByText("Confirmed")).toBeInTheDocument()
  })

  it("refetches with a kiosk filter applied", async () => {
    const user = userEvent.setup()
    renderWithClient(<AdminCommissionsPage />)

    await screen.findByText("Amazon")
    await user.click(screen.getByLabelText("Kiosk"))
    await user.click(await screen.findByRole("option", { name: "Kiosk One" }))

    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining("kioskId=kiosk-1"),
        expect.anything(),
      ),
    )
  })

  it("paginates at 25 rows per page and navigates to the next page", async () => {
    const manyEvents: CommissionEvent[] = Array.from({ length: 30 }, (_, i) => ({
      ...events[0],
      id: `ev-${i + 1}`,
      commissionAmount: 1000 + i,
    }))
    global.fetch = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      const method = init?.method ?? "GET"
      if (url.startsWith("/api/proxy/commission-events") && method === "GET") {
        return { ok: true, status: 200, json: async () => manyEvents } as Response
      }
      if (url === "/api/proxy/kiosks") return { ok: true, status: 200, json: async () => kiosks } as Response
      if (url === "/api/proxy/locations") return { ok: true, status: 200, json: async () => locations } as Response
      if (url === "/api/proxy/devices") return { ok: true, status: 200, json: async () => devices } as Response
      if (url === "/api/proxy/merchants") return { ok: true, status: 200, json: async () => merchants } as Response
      throw new Error(`Unhandled fetch in test: ${method} ${url}`)
    }) as jest.Mock

    renderWithClient(<AdminCommissionsPage />)

    const firstAmount = formatCurrency(manyEvents[0].commissionAmount)
    const lastOnPage1 = formatCurrency(manyEvents[24].commissionAmount)
    const firstOnPage2 = formatCurrency(manyEvents[25].commissionAmount)

    expect(await screen.findByText(firstAmount)).toBeInTheDocument()
    expect(screen.getByText(lastOnPage1)).toBeInTheDocument()
    expect(screen.queryByText(firstOnPage2)).not.toBeInTheDocument()
    expect(screen.getByText("Showing 1–25 of 30")).toBeInTheDocument()

    await userEvent.click(screen.getByRole("button", { name: /next/i }))

    expect(await screen.findByText(firstOnPage2)).toBeInTheDocument()
    expect(screen.queryByText(firstAmount)).not.toBeInTheDocument()
    expect(screen.getByText("Showing 26–30 of 30")).toBeInTheDocument()
  })

  it("syncs commissions and shows the result", async () => {
    const user = userEvent.setup()
    renderWithClient(<AdminCommissionsPage />)

    await screen.findByText("Amazon")
    await user.click(screen.getByRole("button", { name: /sync now/i }))

    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/proxy/commission-events/sync-now",
        expect.objectContaining({ method: "POST" }),
      ),
    )
  })
})
