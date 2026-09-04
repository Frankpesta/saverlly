import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import LocationDetailPage from "./page"
import type { Device, KioskUser, Location, LocationSetupCode, UserProfile } from "@/lib/api/types"

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

jest.mock("next/navigation", () => ({
  useParams: () => ({ id: "loc-1" }),
  useRouter: () => ({ push: jest.fn() }),
}))

const location: Location = {
  id: "loc-1",
  kioskId: "kiosk-1",
  name: "Downtown",
  address: "1 Main St",
  city: "Springfield",
  state: "IL",
  zip: "00000",
  latitude: null,
  longitude: null,
  tags: ["mall"],
  locationSetupCode: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
}

const setupCode: LocationSetupCode = {
  id: "code-1",
  locationId: "loc-1",
  code: "ABC12345",
  active: true,
  createdAt: "2026-01-01T00:00:00.000Z",
}

const kioskOwner: UserProfile = {
  id: "user-1",
  name: "Jane Owner",
  avatarUrl: null,
  email: "owner@example.com",
  role: "KIOSK_OWNER",
  kioskId: "kiosk-1",
}

const kioskUsers: KioskUser[] = [
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
    managedLocationIds: [],
    disabled: false,
    mustChangePassword: false,
    createdAt: "2026-01-03T00:00:00.000Z",
    updatedAt: "2026-01-03T00:00:00.000Z",
  },
]

const devices: Device[] = [
  {
    id: "device-1",
    locationId: "loc-1",
    label: "Computer 1",
    active: true,
    localDeviceIdentifier: null,
    osVersion: null,
    lastSeenAt: null,
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

describe("LocationDetailPage", () => {
  beforeEach(() => {
    global.fetch = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      const method = init?.method ?? "GET"

      if (url === "/api/proxy/locations/loc-1" && method === "GET") {
        return { ok: true, status: 200, json: async () => location } as Response
      }
      if (url === "/api/proxy/locations/loc-1/setup-code" && method === "GET") {
        return { ok: true, status: 200, json: async () => ({ setupCode }) } as Response
      }
      if (url === "/api/proxy/locations/loc-1/setup-code" && method === "POST") {
        return {
          ok: true,
          status: 201,
          json: async () => ({ id: "code-1", locationId: "loc-1", code: "XYZ98765", active: true, createdAt: "2026-01-02T00:00:00.000Z" }),
        } as Response
      }
      if (url === "/api/proxy/locations/loc-1/setup-code" && method === "PATCH") {
        return {
          ok: true,
          status: 200,
          json: async () => ({ ...setupCode, active: false }),
        } as Response
      }
      if (url === "/api/proxy/devices" && method === "GET") {
        return { ok: true, status: 200, json: async () => devices } as Response
      }
      if (url === "/api/proxy/users/me" && method === "GET") {
        return { ok: true, status: 200, json: async () => kioskOwner } as Response
      }
      if (url === "/api/proxy/locations/loc-1" && method === "DELETE") {
        return { ok: true, status: 204, json: async () => undefined } as Response
      }
      if (url === "/api/proxy/kiosks/kiosk-1/users" && method === "GET") {
        return { ok: true, status: 200, json: async () => kioskUsers } as Response
      }
      if (url === "/api/proxy/kiosks/kiosk-1/users/user-2" && method === "PATCH") {
        return {
          ok: true,
          status: 200,
          json: async () => ({ ...kioskUsers[1], managedLocationIds: ["loc-1"] }),
        } as Response
      }
      throw new Error(`Unhandled fetch in test: ${method} ${url}`)
    }) as jest.Mock
  })

  it("renders the location's fields, setup codes, and devices", async () => {
    renderWithClient(<LocationDetailPage />)

    expect(await screen.findByDisplayValue("Downtown")).toBeInTheDocument()
    expect(await screen.findByText("ABC12345")).toBeInTheDocument()
    expect(await screen.findByText("Computer 1")).toBeInTheDocument()
  })

  // Assigning a manager used to be reachable only from Settings > Team > pencil > a checkbox
  // list of every location, which is the wrong direction to work in from a location's own page.
  it("assigns a team member to this location from the Managers card", async () => {
    const user = userEvent.setup()
    renderWithClient(<LocationDetailPage />)

    await user.click(await screen.findByRole("combobox", { name: "Add a manager" }))
    await user.click(await screen.findByRole("option", { name: "Max Manager" }))
    await user.click(screen.getByRole("button", { name: "Assign" }))

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

  it("regenerates the setup code", async () => {
    renderWithClient(<LocationDetailPage />)

    await screen.findByText("ABC12345")
    await userEvent.click(screen.getByRole("button", { name: /regenerate/i }))

    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/proxy/locations/loc-1/setup-code",
        expect.objectContaining({ method: "POST" }),
      ),
    )
  })

  it("shows a delete button for a kiosk owner and deletes on confirm", async () => {
    const user = userEvent.setup()
    renderWithClient(<LocationDetailPage />)

    const deleteButton = await screen.findByRole("button", { name: /delete/i })
    await user.click(deleteButton)
    const confirmButton = await screen.findByRole("button", { name: "Delete" })
    await user.click(confirmButton)

    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/proxy/locations/loc-1",
        expect.objectContaining({ method: "DELETE" }),
      ),
    )
  })

  it("revokes a setup code via its switch", async () => {
    renderWithClient(<LocationDetailPage />)

    const toggle = await screen.findByRole("switch", { name: "Toggle setup code ABC12345" })
    expect(toggle).toBeChecked()

    await userEvent.click(toggle)

    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/proxy/locations/loc-1/setup-code",
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({ active: false }),
        }),
      ),
    )
  })
})
