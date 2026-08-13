import { render, screen, waitFor, within } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import AdminOverviewPage from "./page"
import type { Coupon, CommissionEvent, Device, Kiosk, Location, Merchant, Payout } from "@/lib/api/types"

jest.mock("next/link", () => {
  return function MockLink({
    href,
    children,
    ...props
  }: React.PropsWithChildren<{ href: string }>) {
    return (
      <a href={href} {...props}>
        {children}
      </a>
    )
  }
})

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
    updatedAt: "2026-01-05T00:00:00.000Z",
  },
  {
    id: "kiosk-2",
    name: "Kiosk Two",
    status: "INACTIVE",
    revenueSharePct: "25.5",
    contactEmail: "owner2@example.com",
    stripeAccountId: null,
    stripePayoutsEnabled: false,
    createdAt: "2026-01-02T00:00:00.000Z",
    updatedAt: "2026-01-02T00:00:00.000Z",
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
  {
    id: "dev-2",
    locationId: "loc-1",
    label: "KSK-002",
    active: false,
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
  {
    id: "m-2",
    name: "Jumia",
    domain: "jumia.com",
    attributionMethod: "COOKIE",
    affiliateTrackingUrl: "https://jumia.com/?ref=saverlly",
    affiliateUrlParamKey: null,
    affiliateUrlParamValue: null,
    affiliateProgramId: null,
    active: true,
    checkoutRecipe: null,
    createdAt: "2026-01-01T00:00:00.000Z",
  },
]

const coupons: Coupon[] = [
  {
    id: "c-1",
    merchantId: "m-1",
    code: "SAVE10",
    description: null,
    source: "MANUAL",
    discountType: "percent",
    discountValue: 10,
    successCount: 8,
    failCount: 2,
    lastTestedAt: null,
    expiresAt: null,
    active: true,
    createdAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "c-2",
    merchantId: "m-2",
    code: "SAVE5",
    description: null,
    source: "MANUAL",
    discountType: "percent",
    discountValue: 5,
    successCount: 1,
    failCount: 9,
    lastTestedAt: null,
    expiresAt: null,
    active: true,
    createdAt: "2026-01-01T00:00:00.000Z",
  },
]

const now = Date.now()
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
    reportedAt: new Date(now).toISOString(),
    confirmedAt: new Date(now).toISOString(),
    reversedAt: null,
    payoutId: null,
  },
  {
    id: "ev-2",
    deviceId: "dev-1",
    merchantId: "m-2",
    couponId: null,
    networkReference: "ref-2",
    orderValue: 2000,
    commissionAmount: 500,
    kioskShareAmount: 0,
    status: "PENDING",
    reportedAt: new Date(now - 120_000).toISOString(),
    confirmedAt: null,
    reversedAt: null,
    payoutId: null,
  },
  {
    id: "ev-3",
    deviceId: "dev-2",
    merchantId: "m-1",
    couponId: null,
    networkReference: "ref-3",
    orderValue: 800,
    commissionAmount: 200,
    kioskShareAmount: 0,
    status: "REVERSED",
    reportedAt: new Date(now - 60_000).toISOString(),
    confirmedAt: null,
    reversedAt: new Date(now - 30_000).toISOString(),
    payoutId: null,
  },
]

const payouts: Payout[] = [
  {
    id: "payout-1",
    kioskId: "kiosk-1",
    periodStart: "2026-01-01T00:00:00.000Z",
    periodEnd: "2026-01-31T00:00:00.000Z",
    totalAmount: 300,
    status: "paid",
    stripeTransferId: "tr_1",
    paidAt: new Date(now).toISOString(),
    createdAt: new Date(now).toISOString(),
  },
]

function renderWithClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>)
}

describe("AdminOverviewPage", () => {
  beforeEach(() => {
    global.fetch = jest.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      const respond = (body: unknown) => ({ ok: true, status: 200, json: async () => body }) as Response
      if (url === "/api/proxy/kiosks") return respond(kiosks)
      if (url === "/api/proxy/locations") return respond(locations)
      if (url === "/api/proxy/devices") return respond(devices)
      if (url === "/api/proxy/commission-events") return respond(events)
      if (url === "/api/proxy/payouts") return respond(payouts)
      if (url === "/api/proxy/merchants") return respond(merchants)
      if (url.startsWith("/api/proxy/coupons")) return respond(coupons)
      throw new Error(`Unhandled fetch in test: ${url}`)
    }) as jest.Mock
  })

  it("computes platform KPI tiles from real data", async () => {
    renderWithClient(<AdminOverviewPage />)

    await waitFor(() => expect(screen.getByText("1 active, 1 inactive")).toBeInTheDocument())
    expect(screen.getByText("1 active, 1 disabled")).toBeInTheDocument()
    expect(await screen.findByText("$1,700")).toBeInTheDocument() // total commissions (unique)
    await waitFor(() => expect(screen.getAllByText("$1,000").length).toBeGreaterThan(0)) // confirmed
    await waitFor(() => expect(screen.getAllByText("$500").length).toBeGreaterThan(0)) // pending
  })

  it("shows the kiosk and device active meters", async () => {
    renderWithClient(<AdminOverviewPage />)

    await waitFor(() => expect(screen.getByText("1 of 2 kiosks active")).toBeInTheDocument())
    expect(screen.getByText("1 of 2 devices active")).toBeInTheDocument()
  })

  it("aggregates coupon success rate across paged coupons", async () => {
    renderWithClient(<AdminOverviewPage />)

    // 9 successes / 20 attempts
    expect(await screen.findByText("45.0%")).toBeInTheDocument()
  })

  it("ranks top kiosks and top merchants from confirmed commissions only", async () => {
    renderWithClient(<AdminOverviewPage />)

    const kioskRow = await screen.findByText((_, el) => el?.textContent === "1. Kiosk One")
    expect(kioskRow).toBeInTheDocument()

    // Scope to the Top merchants panel — "Jumia" also legitimately appears in the Recent
    // Commission Events table below (which shows all statuses, not just confirmed).
    const topMerchantsPanel = screen.getByText("Top merchants").closest("div.rounded-2xl") as HTMLElement
    expect(within(topMerchantsPanel).getByText("Amazon")).toBeInTheDocument()
    expect(within(topMerchantsPanel).queryByText("Jumia")).not.toBeInTheDocument() // only the CONFIRMED event's merchant qualifies
  })

  it("flags a merchant with a low coupon success rate under Needs Attention", async () => {
    renderWithClient(<AdminOverviewPage />)

    expect(await screen.findByText("1 merchant has low coupon success rates")).toBeInTheDocument()
    expect(screen.getByText("1 kiosk is inactive")).toBeInTheDocument()
    expect(screen.getByText("1 devices are disabled")).toBeInTheDocument()
  })

  it("computes payout overview totals", async () => {
    renderWithClient(<AdminOverviewPage />)

    await screen.findByText("Payout overview")
    // available for payout: the one CONFIRMED, un-swept (payoutId null) event's kioskShareAmount
    await waitFor(() => expect(screen.getAllByText("$300").length).toBeGreaterThan(0))
  })

  it("lists the most recently updated kiosk first in recent activity", async () => {
    renderWithClient(<AdminOverviewPage />)

    const activityLink = await screen.findByRole("link", { name: /Kiosk One/ })
    expect(activityLink).toHaveTextContent("was updated")
    expect(activityLink).toHaveAttribute("href", "/admin/kiosks/kiosk-1")

    const createdLink = screen.getByRole("link", { name: /Kiosk Two/ })
    expect(createdLink).toHaveTextContent("was created")
  })
})
