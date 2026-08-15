import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { toast } from "sonner"
import DevicesPage from "./page"
import type { Device, Location } from "@/lib/api/types"

jest.mock("sonner", () => ({
  toast: { info: jest.fn(), error: jest.fn(), success: jest.fn() },
}))

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
    tags: [],
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

describe("DevicesPage", () => {
  beforeEach(() => {
    global.fetch = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      const method = init?.method ?? "GET"

      if (url === "/api/proxy/devices" && method === "GET") {
        return { ok: true, status: 200, json: async () => devices } as Response
      }
      if (url === "/api/proxy/locations" && method === "GET") {
        return { ok: true, status: 200, json: async () => locations } as Response
      }
      if (url === "/api/proxy/devices/device-1" && method === "PATCH") {
        return { ok: true, status: 200, json: async () => ({ ...devices[0], active: false }) } as Response
      }
      throw new Error(`Unhandled fetch in test: ${method} ${url}`)
    }) as jest.Mock
  })

  it("renders devices with their location name and computes stat tiles", async () => {
    renderWithClient(<DevicesPage />)

    expect(await screen.findByText("Computer 1")).toBeInTheDocument()
    expect(screen.getByText("Downtown")).toBeInTheDocument()
    await waitFor(() => expect(screen.getAllByText("1").length).toBeGreaterThan(0))
  })

  it("shows a Download Agent button that is honest about not being wired up yet", async () => {
    renderWithClient(<DevicesPage />)

    const button = await screen.findByRole("button", { name: /download agent/i })
    await userEvent.click(button)

    expect(toast.info).toHaveBeenCalledWith(expect.stringMatching(/isn't available yet/i))
  })

  it("toggles a device's kill-switch", async () => {
    renderWithClient(<DevicesPage />)

    const toggle = await screen.findByRole("switch", { name: "Toggle Computer 1 status" })
    expect(toggle).toBeChecked()

    await userEvent.click(toggle)

    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/proxy/devices/device-1",
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({ active: false }),
        }),
      ),
    )
  })
})
