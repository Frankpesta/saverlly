import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import AdminLocationsPage from "./page"
import type { Device, Kiosk, Location } from "@/lib/api/types"

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

describe("AdminLocationsPage", () => {
  beforeEach(() => {
    global.fetch = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      const method = init?.method ?? "GET"
      if (url === "/api/proxy/locations" && method === "GET") {
        return { ok: true, status: 200, json: async () => locations } as Response
      }
      if (url === "/api/proxy/devices" && method === "GET") {
        return { ok: true, status: 200, json: async () => devices } as Response
      }
      if (url === "/api/proxy/kiosks" && method === "GET") {
        return { ok: true, status: 200, json: async () => kiosks } as Response
      }
      if (url === "/api/proxy/locations" && method === "POST") {
        return {
          ok: true,
          status: 201,
          json: async () => ({ ...locations[0], id: "loc-2", name: "Uptown" }),
        } as Response
      }
      if (url.endsWith("/setup-code") && method === "POST") {
        return {
          ok: true,
          status: 201,
          json: async () => ({
            id: "code-1",
            locationId: "loc-1",
            code: "NEWCODE1",
            active: true,
            createdAt: "2026-01-01T00:00:00.000Z",
          }),
        } as Response
      }
      throw new Error(`Unhandled fetch in test: ${method} ${url}`)
    }) as jest.Mock
  })

  it("renders each location's owning kiosk and computes stat tiles", async () => {
    renderWithClient(<AdminLocationsPage />)

    expect(await screen.findByText("Downtown")).toBeInTheDocument()
    expect(screen.getByText("Kiosk One")).toBeInTheDocument()

    await waitFor(() => expect(screen.getAllByText("1").length).toBeGreaterThan(0))
  })

  it("links New Location to the dedicated create page rather than opening a modal", async () => {
    renderWithClient(<AdminLocationsPage />)

    await screen.findByText("Downtown")
    // Creating a location is now a page of its own
    // (locations/new/page.spec.tsx exercises the actual form).
    expect(screen.getByRole("link", { name: /new location/i })).toHaveAttribute(
      "href",
      "/admin/locations/new",
    )
  })

  // The client asked for the setup code to be easier to find; it previously existed only
  // inside a card on a location's own detail page.
  it("shows an existing setup code inline, with a copy button", async () => {
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
      if (url === "/api/proxy/kiosks" && method === "GET") {
        return { ok: true, status: 200, json: async () => kiosks } as Response
      }
      throw new Error(`Unhandled fetch in test: ${method} ${url}`)
    }) as jest.Mock

    renderWithClient(<AdminLocationsPage />)

    expect(await screen.findByText("ABCD1234")).toBeInTheDocument()
    expect(
      screen.getByRole("button", { name: /copy setup code for downtown/i }),
    ).toBeInTheDocument()
  })

  it("generates a setup code straight from the row when there isn't one", async () => {
    const user = userEvent.setup()
    renderWithClient(<AdminLocationsPage />)

    // The fixture location has no code, so the cell offers to make one.
    await user.click(await screen.findByRole("button", { name: /^generate$/i }))

    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/proxy/locations/loc-1/setup-code",
        expect.objectContaining({ method: "POST" }),
      ),
    )
  })

  it("paginates at 25 rows per page and navigates to the next page", async () => {
    const manyLocations: Location[] = Array.from({ length: 30 }, (_, i) => ({
      ...locations[0],
      id: `loc-${i + 1}`,
      name: `Location ${i + 1}`,
    }))
    global.fetch = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      const method = init?.method ?? "GET"
      if (url === "/api/proxy/locations" && method === "GET") {
        return { ok: true, status: 200, json: async () => manyLocations } as Response
      }
      if (url === "/api/proxy/devices" && method === "GET") {
        return { ok: true, status: 200, json: async () => devices } as Response
      }
      if (url === "/api/proxy/kiosks" && method === "GET") {
        return { ok: true, status: 200, json: async () => kiosks } as Response
      }
      throw new Error(`Unhandled fetch in test: ${method} ${url}`)
    }) as jest.Mock

    renderWithClient(<AdminLocationsPage />)

    expect(await screen.findByText("Location 1")).toBeInTheDocument()
    expect(screen.getByText("Location 25")).toBeInTheDocument()
    expect(screen.queryByText("Location 26")).not.toBeInTheDocument()
    expect(screen.getByText("Showing 1-25 of 30")).toBeInTheDocument()

    await userEvent.click(screen.getByRole("button", { name: /next/i }))

    expect(await screen.findByText("Location 26")).toBeInTheDocument()
    expect(screen.getByText("Location 30")).toBeInTheDocument()
    expect(screen.queryByText("Location 1")).not.toBeInTheDocument()
    expect(screen.getByText("Showing 26-30 of 30")).toBeInTheDocument()
  })
})
