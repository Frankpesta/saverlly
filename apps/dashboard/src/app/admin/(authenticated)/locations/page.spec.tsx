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
    contactEmail: "owner1@example.com",
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
    country: "US",
    latitude: null,
    longitude: null,
    tags: ["mall"],
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
      throw new Error(`Unhandled fetch in test: ${method} ${url}`)
    }) as jest.Mock
  })

  it("renders each location's owning kiosk and computes stat tiles", async () => {
    renderWithClient(<AdminLocationsPage />)

    expect(await screen.findByText("Downtown")).toBeInTheDocument()
    expect(screen.getByText("Kiosk One")).toBeInTheDocument()

    await waitFor(() => expect(screen.getAllByText("1").length).toBeGreaterThan(0))
  })

  it("requires a kiosk to be picked before continuing the New Location wizard", async () => {
    renderWithClient(<AdminLocationsPage />)

    await userEvent.click(await screen.findByRole("button", { name: /new location/i }))
    const continueButton = screen.getByRole("button", { name: /continue/i })
    expect(continueButton).toBeDisabled()
  })

  it("walks the wizard with a kiosk selection and submits the create request", async () => {
    renderWithClient(<AdminLocationsPage />)

    await userEvent.click(await screen.findByRole("button", { name: /new location/i }))

    await userEvent.click(screen.getByRole("combobox"))
    await userEvent.click(await screen.findByRole("option", { name: "Kiosk One" }))

    await userEvent.type(screen.getByLabelText("Name"), "Uptown")
    await userEvent.type(screen.getByLabelText("Address"), "2 Elm St")
    await userEvent.type(screen.getByLabelText("City"), "Springfield")
    await userEvent.type(screen.getByLabelText("State"), "IL")
    await userEvent.type(screen.getByLabelText("Country"), "US")
    await userEvent.click(screen.getByRole("button", { name: /continue/i }))

    await userEvent.click(await screen.findByRole("button", { name: /create location/i }))

    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/proxy/locations",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            kioskId: "kiosk-1",
            name: "Uptown",
            address: "2 Elm St",
            city: "Springfield",
            state: "IL",
            country: "US",
          }),
        }),
      ),
    )
  })
})
