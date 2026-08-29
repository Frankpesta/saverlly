import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import PortalEarningsPage from "./page"
import type { Balance, CommissionEvent, Device, Kiosk, Payout, UserProfile } from "@/lib/api/types"

const currentUser: UserProfile = {
  id: "user-1",
  name: "Kiosk Owner",
  email: "owner@example.com",
  role: "KIOSK_OWNER",
  kioskId: "kiosk-1",
}

const kioskNotConnected: Kiosk = {
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

const payouts: Payout[] = [
  {
    id: "payout-1",
    kioskId: "kiosk-1",
    periodStart: "2026-01-01T00:00:00.000Z",
    periodEnd: "2026-01-31T00:00:00.000Z",
    totalAmount: 300,
    status: "paid",
    stripeTransferId: "tr_1",
    paidAt: "2026-02-01T00:00:00.000Z",
    createdAt: "2026-02-01T00:00:00.000Z",
  },
]

function renderWithClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>)
}

describe("PortalEarningsPage", () => {
  beforeEach(() => {
    global.fetch = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      const method = init?.method ?? "GET"

      if (url === "/api/proxy/users/me") return { ok: true, status: 200, json: async () => currentUser } as Response
      if (url === "/api/proxy/kiosks/kiosk-1") {
        return { ok: true, status: 200, json: async () => kioskNotConnected } as Response
      }
      if (url === "/api/proxy/my/balance") return { ok: true, status: 200, json: async () => balance } as Response
      if (url === "/api/proxy/my/commission-events") {
        return { ok: true, status: 200, json: async () => events } as Response
      }
      if (url === "/api/proxy/my/payouts") return { ok: true, status: 200, json: async () => payouts } as Response
      if (url === "/api/proxy/devices") return { ok: true, status: 200, json: async () => devices } as Response
      if (url === "/api/proxy/my/stripe/onboard" && method === "POST") {
        return { ok: true, status: 200, json: async () => ({ url: "https://connect.stripe.com/setup/abc" }) } as Response
      }

      throw new Error(`Unhandled fetch in test: ${method} ${url}`)
    }) as jest.Mock

  })

  it("shows balance, commission history, and payout history", async () => {
    renderWithClient(<PortalEarningsPage />)

    expect(await screen.findByText("$1,200")).toBeInTheDocument()
    expect(screen.getByText("KSK-001")).toBeInTheDocument()
    expect(screen.getByText("Confirmed")).toBeInTheDocument()
    // "Paid" also appears as the payout-history table's column header — badge is one of two matches.
    expect(screen.getAllByText("Paid").length).toBeGreaterThan(1)
  })

  it("shows a Connect with Stripe CTA when not connected, and requests an onboarding link on click", async () => {
    // jsdom refuses real cross-origin navigation, so `window.location.href = url` is a no-op
    // there — this test verifies the mutation that drives the redirect fires correctly instead
    // of the actual browser navigation, which isn't observable in this environment.
    const user = userEvent.setup()
    renderWithClient(<PortalEarningsPage />)

    const connectButton = await screen.findByRole("button", { name: /connect with stripe/i })
    await user.click(connectButton)

    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/proxy/my/stripe/onboard",
        expect.objectContaining({ method: "POST" }),
      ),
    )
  })
})
