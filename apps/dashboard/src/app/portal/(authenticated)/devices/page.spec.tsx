import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import DevicesPage from "./page"
import type { Device, Location } from "@/lib/api/types"
import type { AgentRelease } from "@/lib/api/hooks/use-agent-release"

jest.mock("sonner", () => ({
  toast: { info: jest.fn(), error: jest.fn(), success: jest.fn() },
}))

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

// Mutated per-test to cover the remote and unavailable shapes, then restored.
const agentRelease: AgentRelease = {
  available: true,
  version: "0.1.0",
  filename: "SaverllyAgentSetup.exe",
  sizeBytes: 32320178,
  sha256: "a".repeat(64),
  builtAt: "2026-09-02T18:33:00.000Z",
  remoteUrl: null,
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
    tags: [],
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
      if (url === "/api/proxy/releases/agent/latest/meta") {
        return { ok: true, status: 200, json: async () => agentRelease } as Response
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

  // This button used to link to an unset NEXT_PUBLIC_ var and fall back to a toast saying the
  // download "isn't available yet", so it never actually downloaded anything.
  it("downloads through the backend, and states the version and size first", async () => {
    renderWithClient(<DevicesPage />)

    const link = await screen.findByRole("link", { name: /download agent/i })
    expect(link).toHaveAttribute("href", "/api/proxy/releases/agent/latest")
    expect(screen.getByText(/v0\.1\.0 · 31 MB/)).toBeInTheDocument()
  })

  it("links straight to object storage when the release is hosted remotely", async () => {
    const original = { ...agentRelease }
    Object.assign(agentRelease, {
      remoteUrl: "https://cdn.example.com/SaverllyAgentSetup.exe",
      sizeBytes: null,
    })

    renderWithClient(<DevicesPage />)

    const link = await screen.findByRole("link", { name: /download agent/i })
    expect(link).toHaveAttribute("href", "https://cdn.example.com/SaverllyAgentSetup.exe")

    Object.assign(agentRelease, original)
  })

  it("disables the button when no installer is published", async () => {
    const original = { ...agentRelease }
    Object.assign(agentRelease, { available: false })

    renderWithClient(<DevicesPage />)

    expect(await screen.findByRole("button", { name: /download agent/i })).toBeDisabled()
    expect(screen.getByText(/no installer has been published/i)).toBeInTheDocument()

    Object.assign(agentRelease, original)
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
