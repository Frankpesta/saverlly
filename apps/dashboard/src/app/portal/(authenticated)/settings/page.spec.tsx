import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import PortalSettingsPage from "./page"
import type { KioskUser, Location, UserProfile } from "@/lib/api/types"

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

const owner: UserProfile = {
  id: "user-1",
  name: "Jane Owner",
  avatarUrl: null,
  email: "owner@example.com",
  role: "KIOSK_OWNER",
  kioskId: "kiosk-1",
}

const manager: UserProfile = {
  id: "user-2",
  name: "Max Manager",
  avatarUrl: null,
  email: "manager@example.com",
  role: "LOCATION_MANAGER",
  kioskId: "kiosk-1",
}

const users: KioskUser[] = [
  {
    id: "user-1",
    name: "Jane Owner",
    avatarUrl: null,
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
    avatarUrl: null,
    email: "manager@example.com",
    role: "LOCATION_MANAGER",
    kioskId: "kiosk-1",
    disabled: false,
    managedLocationIds: ["loc-1"],
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
            json: async () => ({ ...users[1], disabled: true }),
          } as Response
        }

        throw new Error(`Unhandled fetch in test: ${method} ${url}`)
      }) as jest.Mock
    })

    it("shows the team roster, grouped by owner and managers", async () => {
      renderWithClient(<PortalSettingsPage />)

      expect(await screen.findByText("manager@example.com")).toBeInTheDocument()
      expect(screen.getByText("Owner")).toBeInTheDocument()
      expect(screen.getByText("Location managers")).toBeInTheDocument()
    })

    // Personal details moved to /portal/profile, so Settings is team plus password only.
    it("no longer carries the account or kiosk sections", async () => {
      renderWithClient(<PortalSettingsPage />)

      await screen.findByText("manager@example.com")
      expect(screen.queryByText("Account")).not.toBeInTheDocument()
      expect(screen.queryByText("Revenue share")).not.toBeInTheDocument()
      expect(global.fetch).not.toHaveBeenCalledWith("/api/proxy/kiosks/kiosk-1", expect.anything())
    })

    it("shows the self-service change-password card", async () => {
      renderWithClient(<PortalSettingsPage />)

      expect(await screen.findByText("manager@example.com")).toBeInTheDocument()
      expect(screen.getByRole("button", { name: /update password/i })).toBeInTheDocument()
    })

    // Managers' locations used to be visible only after opening an edit dialog.
    it("names each manager's assigned locations inline", async () => {
      renderWithClient(<PortalSettingsPage />)

      expect(await screen.findByText("Downtown")).toBeInTheDocument()
    })

    it("links to the create and edit pages rather than opening modals", async () => {
      renderWithClient(<PortalSettingsPage />)

      await screen.findByText("manager@example.com")
      expect(screen.getByRole("link", { name: /add team member/i })).toHaveAttribute(
        "href",
        "/portal/settings/team/new",
      )
      expect(screen.getByRole("link", { name: /edit manager@example.com/i })).toHaveAttribute(
        "href",
        "/portal/settings/team/user-2",
      )
    })

    it("disables the access toggle for the kiosk-owner's own row", async () => {
      renderWithClient(<PortalSettingsPage />)

      await screen.findByText("manager@example.com")
      const toggles = screen.getAllByRole("switch")
      expect(toggles[0]).toBeDisabled() // owner row
      expect(toggles[1]).not.toBeDisabled() // location-manager row
    })

    it("suspends a manager's access from the roster", async () => {
      const user = userEvent.setup()
      renderWithClient(<PortalSettingsPage />)

      await screen.findByText("manager@example.com")
      await user.click(screen.getByRole("switch", { name: /toggle manager@example.com access/i }))

      await waitFor(() =>
        expect(global.fetch).toHaveBeenCalledWith(
          "/api/proxy/kiosks/kiosk-1/users/user-2",
          expect.objectContaining({
            method: "PATCH",
            body: JSON.stringify({ disabled: true }),
          }),
        ),
      )
    })

    it("does not offer an edit link for the owner's own row", async () => {
      renderWithClient(<PortalSettingsPage />)

      await screen.findByText("manager@example.com")
      expect(screen.queryByRole("link", { name: /edit owner@example.com/i })).not.toBeInTheDocument()
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

    it("never fetches kiosk or team data", async () => {
      renderWithClient(<PortalSettingsPage />)

      await screen.findByRole("link", { name: "Jane Owner" })

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

      await screen.findByRole("link", { name: "Jane Owner" })
      expect(screen.getByRole("button", { name: /update password/i })).toBeInTheDocument()
    })
  })
})
