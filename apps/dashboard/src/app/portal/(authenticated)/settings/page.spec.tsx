import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import PortalSettingsPage from "./page"
import type { Kiosk, KioskUser, UserProfile } from "@/lib/api/types"

const owner: UserProfile = {
  id: "user-1",
  email: "owner@example.com",
  role: "KIOSK_OWNER",
  kioskId: "kiosk-1",
}

const manager: UserProfile = {
  id: "user-2",
  email: "manager@example.com",
  role: "LOCATION_MANAGER",
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

const users: KioskUser[] = [
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

describe("PortalSettingsPage", () => {
  describe("as a kiosk owner", () => {
    beforeEach(() => {
      global.fetch = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input)
        const method = init?.method ?? "GET"

        if (url === "/api/proxy/users/me") return { ok: true, status: 200, json: async () => owner } as Response
        if (url === "/api/proxy/kiosks/kiosk-1") return { ok: true, status: 200, json: async () => kiosk } as Response
        if (url === "/api/proxy/kiosks/kiosk-1/users") {
          return { ok: true, status: 200, json: async () => users } as Response
        }
        if (url === "/api/proxy/kiosks/kiosk-1/users" && method === "POST") {
          return { ok: true, status: 201, json: async () => users[1] } as Response
        }

        throw new Error(`Unhandled fetch in test: ${method} ${url}`)
      }) as jest.Mock
    })

    it("shows account info, kiosk details, and the team roster", async () => {
      renderWithClient(<PortalSettingsPage />)

      expect(await screen.findByText("owner@example.com")).toBeInTheDocument()
      expect(await screen.findByText("Kiosk One")).toBeInTheDocument()
      expect(screen.getByText("30%")).toBeInTheDocument()
      expect(await screen.findByText("manager@example.com")).toBeInTheDocument()
    })

    it("disables the access toggle for the kiosk-owner's own row", async () => {
      renderWithClient(<PortalSettingsPage />)

      await screen.findByText("manager@example.com")
      const toggles = screen.getAllByRole("switch")
      expect(toggles[0]).toBeDisabled() // owner row
      expect(toggles[1]).not.toBeDisabled() // location-manager row
    })

    it("adds a team member as a location manager with no role picker", async () => {
      const user = userEvent.setup()
      renderWithClient(<PortalSettingsPage />)

      await screen.findByText("manager@example.com")
      await user.click(screen.getByRole("button", { name: /add team member/i }))
      await user.type(screen.getByLabelText("Email"), "new@example.com")
      await user.type(screen.getByLabelText("Temporary password"), "password123")
      await user.click(screen.getByRole("button", { name: "Add team member" }))

      await waitFor(() =>
        expect(global.fetch).toHaveBeenCalledWith(
          "/api/proxy/kiosks/kiosk-1/users",
          expect.objectContaining({
            method: "POST",
            body: JSON.stringify({ email: "new@example.com", password: "password123", role: "LOCATION_MANAGER" }),
          }),
        ),
      )
    })
  })

  describe("as a location manager", () => {
    beforeEach(() => {
      global.fetch = jest.fn(async (input: RequestInfo | URL) => {
        const url = String(input)
        if (url === "/api/proxy/users/me") return { ok: true, status: 200, json: async () => manager } as Response
        throw new Error(`Unhandled fetch in test: ${url}`)
      }) as jest.Mock
    })

    it("shows only account info, never fetches kiosk or team data", async () => {
      renderWithClient(<PortalSettingsPage />)

      expect(await screen.findByText("manager@example.com")).toBeInTheDocument()
      expect(
        screen.getByText("Contact your kiosk owner to manage kiosk details or team access."),
      ).toBeInTheDocument()

      expect(global.fetch).not.toHaveBeenCalledWith("/api/proxy/kiosks/kiosk-1", expect.anything())
      expect(global.fetch).not.toHaveBeenCalledWith("/api/proxy/kiosks/kiosk-1/users", expect.anything())
    })
  })
})
