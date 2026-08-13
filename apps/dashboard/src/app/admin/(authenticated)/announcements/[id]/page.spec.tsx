import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import AdminAnnouncementDetailPage from "./page"
import type { Announcement, Kiosk, Location } from "@/lib/api/types"

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

let currentId = "ann-1"
const push = jest.fn()
jest.mock("next/navigation", () => ({
  useParams: () => ({ id: currentId }),
  useRouter: () => ({ push }),
}))

const kiosks: Kiosk[] = [
  {
    id: "kiosk-1",
    name: "Main Street Kiosk",
    status: "ACTIVE",
    revenueSharePct: "30",
    contactEmail: "kiosk@test.com",
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
    tags: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
]

const kioskAnnouncement: Announcement = {
  id: "ann-1",
  kioskId: "kiosk-1",
  locationIds: [],
  title: "Kiosk Promo",
  body: "Save big!",
  mediaUrl: null,
  startAt: "2026-01-01T00:00:00.000Z",
  endAt: "2026-06-01T00:00:00.000Z",
  repeatPolicy: "EVERY_LOGIN",
  maxDisplayCount: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
}

const broadcastAnnouncement: Announcement = {
  id: "ann-2",
  kioskId: null,
  locationIds: [],
  title: "Platform Broadcast",
  body: "Everyone sees this",
  mediaUrl: null,
  startAt: "2026-01-01T00:00:00.000Z",
  endAt: "2026-06-01T00:00:00.000Z",
  repeatPolicy: "ONCE",
  maxDisplayCount: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
}

function renderWithClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>)
}

describe("AdminAnnouncementDetailPage", () => {
  beforeEach(() => {
    push.mockClear()
    global.fetch = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      const method = init?.method ?? "GET"
      if (url === "/api/proxy/announcements/ann-1" && method === "GET") {
        return { ok: true, status: 200, json: async () => kioskAnnouncement } as Response
      }
      if (url === "/api/proxy/announcements/ann-2" && method === "GET") {
        return { ok: true, status: 200, json: async () => broadcastAnnouncement } as Response
      }
      if (url === "/api/proxy/kiosks" && method === "GET") {
        return { ok: true, status: 200, json: async () => kiosks } as Response
      }
      if (url === "/api/proxy/locations" && method === "GET") {
        return { ok: true, status: 200, json: async () => locations } as Response
      }
      throw new Error(`Unhandled fetch in test: ${method} ${url}`)
    }) as jest.Mock
  })

  it("shows the owning kiosk badge and a location targeting section for a normal announcement", async () => {
    currentId = "ann-1"
    renderWithClient(<AdminAnnouncementDetailPage />)

    expect(await screen.findByDisplayValue("Kiosk Promo")).toBeInTheDocument()
    expect(await screen.findByText("Main Street Kiosk")).toBeInTheDocument()
    expect(screen.getByText("All locations")).toBeInTheDocument()
  })

  it("shows an 'All kiosks' badge and hides targeting for a broadcast announcement", async () => {
    currentId = "ann-2"
    renderWithClient(<AdminAnnouncementDetailPage />)

    expect(await screen.findByDisplayValue("Platform Broadcast")).toBeInTheDocument()
    expect(screen.getByText("All kiosks")).toBeInTheDocument()
    expect(screen.queryByText("All locations")).not.toBeInTheDocument()
    expect(screen.getByText("Schedule")).toBeInTheDocument()
    expect(screen.queryByText("Schedule & targeting")).not.toBeInTheDocument()
  })

  it("saves without a locationIds field for a broadcast announcement", async () => {
    currentId = "ann-2"
    global.fetch = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      const method = init?.method ?? "GET"
      if (url === "/api/proxy/announcements/ann-2" && method === "GET") {
        return { ok: true, status: 200, json: async () => broadcastAnnouncement } as Response
      }
      if (url === "/api/proxy/kiosks" && method === "GET") {
        return { ok: true, status: 200, json: async () => kiosks } as Response
      }
      if (url === "/api/proxy/locations" && method === "GET") {
        return { ok: true, status: 200, json: async () => locations } as Response
      }
      if (url === "/api/proxy/announcements/ann-2" && method === "PATCH") {
        return { ok: true, status: 200, json: async () => broadcastAnnouncement } as Response
      }
      throw new Error(`Unhandled fetch in test: ${method} ${url}`)
    }) as jest.Mock

    renderWithClient(<AdminAnnouncementDetailPage />)

    await screen.findByDisplayValue("Platform Broadcast")
    await userEvent.click(screen.getByRole("button", { name: /save changes/i }))

    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/proxy/announcements/ann-2",
        expect.objectContaining({ method: "PATCH" }),
      ),
    )
    const [, init] = (global.fetch as jest.Mock).mock.calls.find(([, i]) => i?.method === "PATCH")
    const body = JSON.parse(init.body)
    expect(body.locationIds).toBeUndefined()
  })

  it("deletes the announcement after confirming", async () => {
    currentId = "ann-1"
    global.fetch = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      const method = init?.method ?? "GET"
      if (url === "/api/proxy/announcements/ann-1" && method === "GET") {
        return { ok: true, status: 200, json: async () => kioskAnnouncement } as Response
      }
      if (url === "/api/proxy/kiosks" && method === "GET") {
        return { ok: true, status: 200, json: async () => kiosks } as Response
      }
      if (url === "/api/proxy/locations" && method === "GET") {
        return { ok: true, status: 200, json: async () => locations } as Response
      }
      if (url === "/api/proxy/announcements/ann-1" && method === "DELETE") {
        return { ok: true, status: 204, json: async () => undefined } as Response
      }
      throw new Error(`Unhandled fetch in test: ${method} ${url}`)
    }) as jest.Mock

    renderWithClient(<AdminAnnouncementDetailPage />)

    await screen.findByDisplayValue("Kiosk Promo")
    await userEvent.click(screen.getByRole("button", { name: /^delete$/i }))

    const dialog = await screen.findByRole("alertdialog")
    await userEvent.click(within(dialog).getByRole("button", { name: /^delete$/i }))

    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/proxy/announcements/ann-1",
        expect.objectContaining({ method: "DELETE" }),
      ),
    )
    await waitFor(() => expect(push).toHaveBeenCalledWith("/admin/announcements"))
  })
})
