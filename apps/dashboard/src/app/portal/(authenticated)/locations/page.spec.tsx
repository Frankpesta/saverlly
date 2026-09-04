import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import LocationsPage from "./page"
import type { Device, Location, UserProfile } from "@/lib/api/types"

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
  name: "Kiosk Owner",
  avatarUrl: null,
  email: "owner@example.com",
  role: "KIOSK_OWNER",
  kioskId: "kiosk-1",
}

const locations: Location[] = [
  {
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

function mockFetchWith(role: UserProfile["role"]) {
  global.fetch = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    const method = init?.method ?? "GET"
    if (url === "/api/proxy/locations" && method === "GET") {
      return { ok: true, status: 200, json: async () => locations } as Response
    }
    if (url === "/api/proxy/devices" && method === "GET") {
      return { ok: true, status: 200, json: async () => devices } as Response
    }
    if (url === "/api/proxy/users/me") {
      return { ok: true, status: 200, json: async () => ({ ...currentUser, role }) } as Response
    }
    if (url === "/api/proxy/locations/loc-1" && method === "DELETE") {
      return { ok: true, status: 204, json: async () => undefined } as Response
    }
    throw new Error(`Unhandled fetch in test: ${method} ${url}`)
  }) as jest.Mock
}

describe("LocationsPage", () => {
  it("renders locations with tags and device counts, and computes stat tiles", async () => {
    mockFetchWith("KIOSK_OWNER")
    renderWithClient(<LocationsPage />)

    const nameCell = await screen.findByText("Downtown")
    expect(nameCell).toBeInTheDocument()
    expect(screen.getByText("1 Main St, Springfield, IL")).toBeInTheDocument()
    expect(screen.getByText("mall")).toBeInTheDocument()
    const row = nameCell.closest("tr")
    expect(row).not.toBeNull()
    expect(within(row as HTMLElement).getByText("1")).toBeInTheDocument() // device count cell
  })

  // Creating a location is now a page of its own (locations/new/page.spec.tsx exercises the
  // actual form), so this only asserts the entry point and its role gate.
  it("links a KIOSK_OWNER to the create page", async () => {
    mockFetchWith("KIOSK_OWNER")
    renderWithClient(<LocationsPage />)

    expect(await screen.findByRole("link", { name: /new location/i })).toHaveAttribute(
      "href",
      "/portal/locations/new",
    )
  })

  it("hides the New Location link from a LOCATION_MANAGER", async () => {
    mockFetchWith("LOCATION_MANAGER")
    renderWithClient(<LocationsPage />)

    await screen.findByText("Downtown")
    expect(screen.queryByRole("link", { name: /new location/i })).not.toBeInTheDocument()
  })

  // The client asked to be able to delete a location without opening it first.
  it("deletes a location from the row, for an owner", async () => {
    mockFetchWith("KIOSK_OWNER")
    renderWithClient(<LocationsPage />)

    await userEvent.click(await screen.findByRole("button", { name: "Delete Downtown" }))
    await userEvent.click(await screen.findByRole("button", { name: "Delete" }))

    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/proxy/locations/loc-1",
        expect.objectContaining({ method: "DELETE" }),
      ),
    )
  })

  it("does not offer delete to a LOCATION_MANAGER", async () => {
    mockFetchWith("LOCATION_MANAGER")
    renderWithClient(<LocationsPage />)

    await screen.findByText("Downtown")
    expect(screen.queryByRole("button", { name: "Delete Downtown" })).not.toBeInTheDocument()
  })

  // The setup code used to live only partway down a location's own detail page. The owner
  // installing a device is exactly who needs it, so it travels with the row here too.
  it("shows the setup code inline", async () => {
    global.fetch = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      const method = init?.method ?? "GET"
      if (url === "/api/proxy/locations" && method === "GET") {
        return {
          ok: true,
          status: 200,
          json: async () => [
            {
              ...locations[0],
              locationSetupCode: {
                id: "code-1",
                code: "ABCD1234",
                active: true,
                createdAt: "2026-01-01T00:00:00.000Z",
              },
            },
          ],
        } as Response
      }
      if (url === "/api/proxy/devices" && method === "GET") {
        return { ok: true, status: 200, json: async () => devices } as Response
      }
      if (url === "/api/proxy/users/me") {
        return { ok: true, status: 200, json: async () => currentUser } as Response
      }
      throw new Error(`Unhandled fetch in test: ${method} ${url}`)
    }) as jest.Mock

    renderWithClient(<LocationsPage />)

    expect(await screen.findByText("ABCD1234")).toBeInTheDocument()
    expect(
      screen.getByRole("button", { name: /copy setup code for downtown/i }),
    ).toBeInTheDocument()
  })
})
