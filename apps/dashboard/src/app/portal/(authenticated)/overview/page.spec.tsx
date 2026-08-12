import { render, screen, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import PortalOverviewPage from "./page"
import type { Kiosk, KioskUser, UserProfile } from "@/lib/api/types"

const currentUser: UserProfile = {
  id: "user-1",
  email: "owner@example.com",
  role: "KIOSK_OWNER",
  kioskId: "kiosk-1",
}

const kiosk: Kiosk = {
  id: "kiosk-1",
  name: "Kiosk One",
  status: "ACTIVE",
  revenueSharePct: "30",
  contactEmail: "owner1@example.com",
  stripeAccountId: null,
  stripePayoutsEnabled: false,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
}

const kioskUsers: KioskUser[] = [
  {
    id: "user-1",
    email: "owner@example.com",
    role: "KIOSK_OWNER",
    kioskId: "kiosk-1",
    disabled: false,
    managedLocationIds: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "user-2",
    email: "manager@example.com",
    role: "LOCATION_MANAGER",
    kioskId: "kiosk-1",
    disabled: false,
    managedLocationIds: [],
    createdAt: "2026-01-03T00:00:00.000Z",
    updatedAt: "2026-01-03T00:00:00.000Z",
  },
]

function renderWithClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>)
}

describe("PortalOverviewPage", () => {
  beforeEach(() => {
    global.fetch = jest.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url === "/api/proxy/users/me") {
        return { ok: true, status: 200, json: async () => currentUser } as Response
      }
      if (url === "/api/proxy/kiosks/kiosk-1") {
        return { ok: true, status: 200, json: async () => kiosk } as Response
      }
      if (url === "/api/proxy/kiosks/kiosk-1/users") {
        return { ok: true, status: 200, json: async () => kioskUsers } as Response
      }
      throw new Error(`Unhandled fetch in test: ${url}`)
    }) as jest.Mock
  })

  it("shows the current user's own kiosk status, revenue share, and team size", async () => {
    renderWithClient(<PortalOverviewPage />)

    expect(await screen.findByText("A snapshot of Kiosk One.")).toBeInTheDocument()
    expect(screen.getByText("ACTIVE")).toBeInTheDocument()
    await waitFor(() => expect(screen.getByText("30.0%")).toBeInTheDocument(), { timeout: 2000 })
    await waitFor(() => expect(screen.getByText("2")).toBeInTheDocument(), { timeout: 2000 })
  })

  it("lists team members with their roles", async () => {
    renderWithClient(<PortalOverviewPage />)

    await waitFor(() => expect(screen.getByText("Kiosk owner")).toBeInTheDocument(), {
      timeout: 3000,
    })
    expect(screen.getAllByText("owner@example.com").length).toBeGreaterThan(0)
    expect(screen.getAllByText("manager@example.com").length).toBeGreaterThan(0)
    expect(screen.getByText("Location manager")).toBeInTheDocument()
  })
})
