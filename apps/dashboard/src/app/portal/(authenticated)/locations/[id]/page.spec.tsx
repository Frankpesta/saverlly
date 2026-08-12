import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import LocationDetailPage from "./page"
import type { Device, Location, LocationSetupCode } from "@/lib/api/types"

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
}))

const location: Location = {
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
}

const setupCodes: LocationSetupCode[] = [
  { id: "code-1", locationId: "loc-1", code: "ABC12345", active: true, createdAt: "2026-01-01T00:00:00.000Z" },
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
      if (url === "/api/proxy/locations/loc-1/setup-codes" && method === "GET") {
        return { ok: true, status: 200, json: async () => setupCodes } as Response
      }
      if (url === "/api/proxy/locations/loc-1/setup-codes" && method === "POST") {
        return {
          ok: true,
          status: 201,
          json: async () => ({ id: "code-2", locationId: "loc-1", code: "XYZ98765", active: true, createdAt: "2026-01-02T00:00:00.000Z" }),
        } as Response
      }
      if (url === "/api/proxy/locations/loc-1/setup-codes/code-1" && method === "PATCH") {
        return {
          ok: true,
          status: 200,
          json: async () => ({ ...setupCodes[0], active: false }),
        } as Response
      }
      if (url === "/api/proxy/devices" && method === "GET") {
        return { ok: true, status: 200, json: async () => devices } as Response
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

  it("generates a new setup code", async () => {
    renderWithClient(<LocationDetailPage />)

    await screen.findByText("ABC12345")
    await userEvent.click(screen.getByRole("button", { name: /generate/i }))

    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/proxy/locations/loc-1/setup-codes",
        expect.objectContaining({ method: "POST" }),
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
        "/api/proxy/locations/loc-1/setup-codes/code-1",
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({ active: false }),
        }),
      ),
    )
  })
})
