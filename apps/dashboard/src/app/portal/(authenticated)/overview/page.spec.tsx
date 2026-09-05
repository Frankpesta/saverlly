import { render, screen, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import PortalOverviewPage from "./page"
import type {
  Announcement,
  Balance,
  CommissionEvent,
  Device,
  Kiosk,
  Location,
  Payout,
  UserProfile,
} from "@/lib/api/types"

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

const currentUser: UserProfile = {
  id: "user-1",
  name: "Jane Owner",
  avatarUrl: null,
  email: "owner@example.com",
  role: "KIOSK_OWNER",
  kioskId: "kiosk-1",
}

const locationManager: UserProfile = {
  id: "user-2",
  name: "Sam Manager",
  avatarUrl: null,
  email: "manager@example.com",
  role: "LOCATION_MANAGER",
  kioskId: "kiosk-1",
}

const kiosk: Kiosk = {
  id: "kiosk-1",
  name: "Kiosk One",
  status: "ACTIVE",
  revenueSharePct: "30",
  stripeAccountId: null,
  stripePayoutsEnabled: false,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
}

const balance: Balance = { pendingAmount: 500, confirmedAvailableAmount: 1200 }

const locations: Location[] = [
  {
    id: "loc-1",
    kioskId: "kiosk-1",
    name: "Lagos Central",
    address: "1 Main St",
    city: "Lagos",
    state: "Lagos",
    zip: "100001",
    latitude: null,
    longitude: null,
    tags: [],
    locationSetupCode: null,
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
    payoutId: "payout-1",
  },
  {
    id: "ev-2",
    deviceId: "dev-2",
    merchantId: "m-2",
    couponId: null,
    networkReference: "ref-2",
    orderValue: 900,
    commissionAmount: 400,
    kioskShareAmount: 0,
    status: "PENDING",
    reportedAt: new Date(now - 60_000).toISOString(),
    confirmedAt: null,
    reversedAt: null,
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

const announcements: Announcement[] = [
  {
    id: "ann-1",
    kioskId: "kiosk-1",
    createdById: "user-1",
    locationIds: [],
    title: "New promo",
    body: "Body",
    mediaUrl: null,
    layout: null,
    startAt: new Date(now).toISOString(),
    endAt: new Date(now + 86_400_000).toISOString(),
    repeatPolicy: "ONCE",
    maxDisplayCount: null,
    createdAt: new Date(now).toISOString(),
    updatedAt: new Date(now).toISOString(),
  },
  {
    id: "ann-2",
    kioskId: null,
    createdById: "user-1",
    locationIds: [],
    title: "Platform maintenance",
    body: "Body",
    mediaUrl: null,
    layout: null,
    startAt: new Date(now).toISOString(),
    endAt: new Date(now + 86_400_000).toISOString(),
    repeatPolicy: "ONCE",
    maxDisplayCount: null,
    createdAt: new Date(now - 10_000).toISOString(),
    updatedAt: new Date(now - 10_000).toISOString(),
  },
]

function renderWithClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>)
}

let activeUser: UserProfile = currentUser

describe("PortalOverviewPage", () => {
  beforeEach(() => {
    activeUser = currentUser
    global.fetch = jest.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      const respond = (body: unknown) => ({ ok: true, status: 200, json: async () => body }) as Response
      const forbidden = () => ({ ok: false, status: 403, json: async () => ({ message: "Forbidden" }) }) as Response
      if (url === "/api/proxy/users/me") return respond(activeUser)
      if (url === "/api/proxy/kiosks/kiosk-1") return respond(kiosk)
      if (url === "/api/proxy/my/balance") return activeUser.role === "KIOSK_OWNER" ? respond(balance) : forbidden()
      if (url === "/api/proxy/my/commission-events")
        return activeUser.role === "KIOSK_OWNER" ? respond(events) : forbidden()
      if (url === "/api/proxy/my/payouts") return activeUser.role === "KIOSK_OWNER" ? respond(payouts) : forbidden()
      if (url === "/api/proxy/locations") return respond(locations)
      if (url === "/api/proxy/devices") return respond(devices)
      if (url === "/api/proxy/announcements") return respond(announcements)
      throw new Error(`Unhandled fetch in test: ${url}`)
    }) as jest.Mock
  })

  it("shows the kiosk's status and operational counts in the header", async () => {
    renderWithClient(<PortalOverviewPage />)

    expect(await screen.findByText("Active")).toBeInTheDocument()
    expect(screen.getByText("Kiosk One")).toBeInTheDocument()
    await waitFor(() => expect(screen.getByText("1 active devices")).toBeInTheDocument())
  })

  it("shows available/pending balance and lifetime earnings from real balance + commission data", async () => {
    renderWithClient(<PortalOverviewPage />)

    expect(await screen.findByText("$1,200")).toBeInTheDocument() // confirmedAvailableAmount
    expect(screen.getAllByText("$500").length).toBeGreaterThan(0) // pendingAmount
    expect(screen.getAllByText("$300").length).toBeGreaterThan(0) // total earnings (CONFIRMED kioskShareAmount)
  })

  it("drops the Merchant column and shows only Device/Amount/Status in Recent Commission Activity", async () => {
    renderWithClient(<PortalOverviewPage />)

    await screen.findByText("Recent commission activity")
    expect(screen.queryByRole("columnheader", { name: "Merchant" })).not.toBeInTheDocument()
    expect(screen.getByRole("columnheader", { name: "Device" })).toBeInTheDocument()
    expect(await screen.findByText("KSK-001")).toBeInTheDocument()
  })

  it("renders a kiosk-scoped announcement as a link but a platform broadcast as plain text", async () => {
    renderWithClient(<PortalOverviewPage />)

    const ownAnnouncement = await screen.findByText("New promo")
    expect(ownAnnouncement.closest("a")).toHaveAttribute("href", "/portal/announcements/ann-1")

    const broadcast = screen.getByText("Platform maintenance")
    expect(broadcast.closest("a")).toBeNull()
  })

  it("shows devices grouped by location", async () => {
    renderWithClient(<PortalOverviewPage />)

    // "Lagos Central" appears in both the Devices-by-location panel and the Locations panel.
    await waitFor(() => expect(screen.getAllByText("Lagos Central").length).toBe(2))
    expect(screen.getByText("2 devices")).toBeInTheDocument()
  })

  it("greets the user by name rather than by their email local-part", async () => {
    renderWithClient(<PortalOverviewPage />)

    expect(await screen.findByText(/Jane Owner/)).toBeInTheDocument()
    expect(screen.queryByText(/owner,/)).not.toBeInTheDocument()
  })

  it("hides all earnings UI from a location manager", async () => {
    activeUser = locationManager
    renderWithClient(<PortalOverviewPage />)

    await screen.findByText(/Sam Manager/)
    expect(screen.queryByText("Earnings")).not.toBeInTheDocument()
    expect(screen.queryByText("Earnings overview")).not.toBeInTheDocument()
    expect(screen.queryByText("Recent commission activity")).not.toBeInTheDocument()
    expect(screen.queryByText("Recent payouts")).not.toBeInTheDocument()
    expect(screen.queryByText("Commission events")).not.toBeInTheDocument()
    expect(screen.queryByText("Available balance")).not.toBeInTheDocument()
    // Non-earnings sections still render for a location manager.
    expect(await screen.findByText("Operations")).toBeInTheDocument()
    expect(screen.getByText("Announcements")).toBeInTheDocument()
  })
})
