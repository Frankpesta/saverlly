import { render, screen } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import TopPerformingKiosksPage from "./page"
import type { CommissionEvent, Device, Kiosk, Location } from "@/lib/api/types"

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
    name: "Low Earner",
    status: "ACTIVE",
    revenueSharePct: "30",
    stripeAccountId: null,
    stripePayoutsEnabled: false,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "kiosk-2",
    name: "Top Earner",
    status: "ACTIVE",
    revenueSharePct: "30",
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
    name: "Loc 1",
    address: "1 Main St",
    city: "Springfield",
    state: "IL",
    zip: "00000",
    latitude: null,
    longitude: null,
    tags: [],
    locationSetupCode: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "loc-2",
    kioskId: "kiosk-2",
    name: "Loc 2",
    address: "2 Main St",
    city: "Springfield",
    state: "IL",
    zip: "00000",
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
    id: "device-1",
    locationId: "loc-1",
    label: "Device 1",
    active: true,
    localDeviceIdentifier: null,
    osVersion: null,
    lastSeenAt: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "device-2",
    locationId: "loc-2",
    label: "Device 2",
    active: true,
    localDeviceIdentifier: null,
    osVersion: null,
    lastSeenAt: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
]

const events: CommissionEvent[] = [
  {
    id: "event-1",
    deviceId: "device-1",
    merchantId: "merchant-1",
    couponId: null,
    networkReference: "ref-1",
    orderValue: 100,
    commissionAmount: 10,
    kioskShareAmount: 3,
    status: "CONFIRMED",
    reportedAt: "2026-01-01T00:00:00.000Z",
    confirmedAt: "2026-01-01T00:00:00.000Z",
  } as CommissionEvent,
  {
    id: "event-2",
    deviceId: "device-2",
    merchantId: "merchant-1",
    couponId: null,
    networkReference: "ref-2",
    orderValue: 1000,
    commissionAmount: 100,
    kioskShareAmount: 30,
    status: "CONFIRMED",
    reportedAt: "2026-01-01T00:00:00.000Z",
    confirmedAt: "2026-01-01T00:00:00.000Z",
  } as CommissionEvent,
]

function renderWithClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>)
}

describe("TopPerformingKiosksPage", () => {
  beforeEach(() => {
    global.fetch = jest.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url === "/api/proxy/kiosks") return { ok: true, status: 200, json: async () => kiosks } as Response
      if (url === "/api/proxy/locations") return { ok: true, status: 200, json: async () => locations } as Response
      if (url === "/api/proxy/devices") return { ok: true, status: 200, json: async () => devices } as Response
      if (url === "/api/proxy/commission-events") return { ok: true, status: 200, json: async () => events } as Response
      throw new Error(`Unhandled fetch in test: ${url}`)
    }) as jest.Mock
  })

  it("ranks kiosks by confirmed commission share, highest first", async () => {
    renderWithClient(<TopPerformingKiosksPage />)

    await screen.findByText("Top Earner")
    const rows = screen.getAllByRole("row")
    // rows[0] is the header row.
    expect(rows[1]).toHaveTextContent("Top Earner")
    expect(rows[2]).toHaveTextContent("Low Earner")
    expect(rows[1]).toHaveTextContent("$30")
    expect(rows[2]).toHaveTextContent("$3")
  })
})
