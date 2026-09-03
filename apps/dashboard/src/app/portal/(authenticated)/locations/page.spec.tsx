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
    if (url === "/api/proxy/locations" && method === "POST") {
      return {
        ok: true,
        status: 201,
        json: async () => ({ ...locations[0], id: "loc-2", name: "Uptown" }),
      } as Response
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

  it("shows the New Location button for a KIOSK_OWNER", async () => {
    mockFetchWith("KIOSK_OWNER")
    renderWithClient(<LocationsPage />)

    expect(await screen.findByRole("button", { name: /new location/i })).toBeInTheDocument()
  })

  it("hides the New Location button for a LOCATION_MANAGER", async () => {
    mockFetchWith("LOCATION_MANAGER")
    renderWithClient(<LocationsPage />)

    await screen.findByText("Downtown")
    expect(screen.queryByRole("button", { name: /new location/i })).not.toBeInTheDocument()
  })

  // More interaction steps than the default 5000ms budget comfortably covers now that
  // City/State are each their own combobox popover (open, search, pick), not plain text
  // inputs. Genuinely slower, not a hang (confirmed passing well within 20s solo).
  it("walks the New Location wizard and submits the create request", async () => {
    mockFetchWith("KIOSK_OWNER")
    renderWithClient(<LocationsPage />)

    await userEvent.click(await screen.findByRole("button", { name: /new location/i }))

    await userEvent.type(screen.getByLabelText("Name"), "Uptown")
    await userEvent.type(screen.getByLabelText("Address"), "2 Elm St")
    await userEvent.click(screen.getByRole("combobox", { name: "City" }))
    await userEvent.type(screen.getByPlaceholderText("Type a city..."), "Springfield")
    await userEvent.click(await screen.findByRole("option", { name: "Springfield" }))

    await userEvent.click(screen.getByRole("combobox", { name: "State" }))
    await userEvent.click(await screen.findByRole("option", { name: "Illinois (IL)" }))

    await userEvent.type(screen.getByLabelText("Zip"), "00000")
    await userEvent.click(screen.getByRole("button", { name: /continue/i }))

    await userEvent.type(await screen.findByLabelText("Tags"), "mall, downtown")
    await userEvent.click(screen.getByRole("button", { name: /create location/i }))

    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/proxy/locations",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            name: "Uptown",
            address: "2 Elm St",
            city: "Springfield",
            state: "IL",
            zip: "00000",
            tags: ["mall", "downtown"],
          }),
        }),
      ),
    )
  }, 20000)
})
