import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import PortalSettingsPage from "./page"
import type { Kiosk, KioskUser, Location, UserProfile } from "@/lib/api/types"

const owner: UserProfile = {
  id: "user-1",
  name: "Jane Owner",
  email: "owner@example.com",
  role: "KIOSK_OWNER",
  kioskId: "kiosk-1",
}

const manager: UserProfile = {
  id: "user-2",
  name: "Max Manager",
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

const users: KioskUser[] = [
  {
    id: "user-1",
    name: "Jane Owner",
    email: "owner@example.com",
    role: "KIOSK_OWNER",
    kioskId: "kiosk-1",
    disabled: false,
    managedLocationIds: [],
    mustChangePassword: false,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "user-2",
    name: "Max Manager",
    email: "manager@example.com",
    role: "LOCATION_MANAGER",
    kioskId: "kiosk-1",
    disabled: false,
    managedLocationIds: [],
    mustChangePassword: false,
    createdAt: "2026-01-03T00:00:00.000Z",
    updatedAt: "2026-01-03T00:00:00.000Z",
  },
]

const locations: Location[] = [
  {
    id: "loc-1",
    kioskId: "kiosk-1",
    name: "Downtown",
    address: "1 Main St",
    city: "Springfield",
    state: "IL",
    zip: "62701",
    latitude: null,
    longitude: null,
    tags: [],
    locationSetupCode: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
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
        if (url === "/api/proxy/kiosks/kiosk-1/users" && method === "POST") {
          return {
            ok: true,
            status: 201,
            json: async () => ({ user: users[1], generatedPassword: "Gen3ratedPassw0rd!" }),
          } as Response
        }
        if (url === "/api/proxy/kiosks/kiosk-1/users") {
          return { ok: true, status: 200, json: async () => users } as Response
        }
        if (url === "/api/proxy/locations") {
          return { ok: true, status: 200, json: async () => locations } as Response
        }
        if (url === "/api/proxy/kiosks/kiosk-1/users/user-2" && method === "PATCH") {
          return {
            ok: true,
            status: 200,
            json: async () => ({ ...users[1], managedLocationIds: ["loc-1"] }),
          } as Response
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

    it("shows the self-service change-password card", async () => {
      renderWithClient(<PortalSettingsPage />)

      expect(await screen.findByText("owner@example.com")).toBeInTheDocument()
      expect(screen.getByRole("button", { name: /update password/i })).toBeInTheDocument()
    })

    it("disables the access toggle for the kiosk-owner's own row", async () => {
      renderWithClient(<PortalSettingsPage />)

      await screen.findByText("manager@example.com")
      const toggles = screen.getAllByRole("switch")
      expect(toggles[0]).toBeDisabled() // owner row
      expect(toggles[1]).not.toBeDisabled() // location-manager row
    })

    it("adds a team member as a location manager with no role picker, and reveals the generated password", async () => {
      const user = userEvent.setup()
      renderWithClient(<PortalSettingsPage />)

      await screen.findByText("manager@example.com")
      await user.click(screen.getByRole("button", { name: /add team member/i }))
      await user.type(screen.getByLabelText("Name"), "New Person")
      await user.type(screen.getByLabelText("Email"), "new@example.com")
      await user.click(screen.getByRole("button", { name: "Add team member" }))

      await waitFor(() =>
        expect(global.fetch).toHaveBeenCalledWith(
          "/api/proxy/kiosks/kiosk-1/users",
          expect.objectContaining({
            method: "POST",
            body: JSON.stringify({
              name: "New Person",
              email: "new@example.com",
              role: "LOCATION_MANAGER",
            }),
          }),
        ),
      )

      expect(await screen.findByText("Gen3ratedPassw0rd!")).toBeInTheDocument()
    })

    it("lets the kiosk owner assign a location to a location manager", async () => {
      const user = userEvent.setup()
      renderWithClient(<PortalSettingsPage />)

      await screen.findByText("manager@example.com")
      await user.click(screen.getByRole("button", { name: /edit manager@example.com/i }))

      const checkbox = await screen.findByRole("checkbox", { name: "Downtown" })
      await user.click(checkbox)
      await user.click(screen.getByRole("button", { name: /save changes/i }))

      await waitFor(() =>
        expect(global.fetch).toHaveBeenCalledWith(
          "/api/proxy/kiosks/kiosk-1/users/user-2",
          expect.objectContaining({
            method: "PATCH",
            body: JSON.stringify({ managedLocationIds: ["loc-1"] }),
          }),
        ),
      )
    })

    it("does not offer a location-assignment edit button for the owner's own row", async () => {
      renderWithClient(<PortalSettingsPage />)

      await screen.findByText("manager@example.com")
      expect(screen.queryByRole("button", { name: /edit owner@example.com/i })).not.toBeInTheDocument()
    })
  })

  describe("as a location manager", () => {
    beforeEach(() => {
      global.fetch = jest.fn(async (input: RequestInfo | URL) => {
        const url = String(input)
        if (url === "/api/proxy/users/me") return { ok: true, status: 200, json: async () => manager } as Response
        if (url === "/api/proxy/my/kiosk-contact")
          return { ok: true, status: 200, json: async () => ({ name: "Jane Owner", email: "owner@example.com" }) } as Response
        throw new Error(`Unhandled fetch in test: ${url}`)
      }) as jest.Mock
    })

    it("shows only account info, never fetches kiosk or team data", async () => {
      renderWithClient(<PortalSettingsPage />)

      expect(await screen.findByText("manager@example.com")).toBeInTheDocument()

      expect(global.fetch).not.toHaveBeenCalledWith("/api/proxy/kiosks/kiosk-1", expect.anything())
      expect(global.fetch).not.toHaveBeenCalledWith("/api/proxy/kiosks/kiosk-1/users", expect.anything())
    })

    it("links the kiosk-owner contact as a mailto so a location manager can reach them directly", async () => {
      renderWithClient(<PortalSettingsPage />)

      const link = await screen.findByRole("link", { name: "Jane Owner" })
      expect(link).toHaveAttribute("href", "mailto:owner@example.com")
    })

    it("still shows the self-service change-password card for a location manager", async () => {
      renderWithClient(<PortalSettingsPage />)

      expect(await screen.findByText("manager@example.com")).toBeInTheDocument()
      expect(screen.getByRole("button", { name: /update password/i })).toBeInTheDocument()
    })
  })
})
