import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import AnnouncementDetailPage from "./page"
import type { Announcement, Location, UserProfile } from "@/lib/api/types"

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

const push = jest.fn()
let mockParamsId = "ann-1"
jest.mock("next/navigation", () => ({
  useParams: () => ({ id: mockParamsId }),
  useRouter: () => ({ push }),
}))

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

const announcement: Announcement = {
  id: "ann-1",
  kioskId: "kiosk-1",
  createdById: "user-1",
  locationIds: [],
  title: "Active Promo",
  body: "Save big!",
  mediaUrl: null,
  layout: null,
  startAt: "2026-01-01T00:00:00.000Z",
  endAt: "2026-06-01T00:00:00.000Z",
  repeatPolicy: "EVERY_LOGIN",
  maxDisplayCount: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
}

const owner: UserProfile = {
  id: "user-1",
  name: "Jane Owner",
  avatarUrl: null,
  email: "owner@example.com",
  role: "KIOSK_OWNER",
  kioskId: "kiosk-1",
}

const locationManager: UserProfile = {
  id: "user-2",
  name: "Max Manager",
  avatarUrl: null,
  email: "manager@example.com",
  role: "LOCATION_MANAGER",
  kioskId: "kiosk-1",
}

const broadcast: Announcement = {
  ...announcement,
  id: "ann-2",
  kioskId: null,
  title: "Platform Broadcast",
}

function renderWithClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>)
}

describe("AnnouncementDetailPage", () => {
  afterEach(() => {
    mockParamsId = "ann-1"
  })

  beforeEach(() => {
    push.mockClear()
    global.fetch = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      const method = init?.method ?? "GET"
      if (url === "/api/proxy/announcements/ann-1" && method === "GET") {
        return { ok: true, status: 200, json: async () => announcement } as Response
      }
      if (url === "/api/proxy/locations" && method === "GET") {
        return { ok: true, status: 200, json: async () => locations } as Response
      }
      if (url === "/api/proxy/announcements/ann-1" && method === "DELETE") {
        return { ok: true, status: 204, json: async () => undefined } as Response
      }
      if (url === "/api/proxy/users/me") {
        return { ok: true, status: 200, json: async () => owner } as Response
      }
      throw new Error(`Unhandled fetch in test: ${method} ${url}`)
    }) as jest.Mock
  })

  it("renders the announcement's fields and live preview", async () => {
    renderWithClient(<AnnouncementDetailPage />)

    expect(await screen.findByDisplayValue("Active Promo")).toBeInTheDocument()
    expect(screen.getByDisplayValue("Save big!")).toBeInTheDocument()
    expect(screen.getAllByText("Active Promo").length).toBeGreaterThan(0)
  })

  it("deletes the announcement after confirming", async () => {
    renderWithClient(<AnnouncementDetailPage />)

    await screen.findByDisplayValue("Active Promo")
    await userEvent.click(screen.getByRole("button", { name: "Delete Active Promo" }))

    const dialog = await screen.findByRole("alertdialog")
    await userEvent.click(
      within(dialog).getByRole("button", { name: /^delete$/i }),
    )

    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/proxy/announcements/ann-1",
        expect.objectContaining({ method: "DELETE" }),
      ),
    )
    await waitFor(() => expect(push).toHaveBeenCalledWith("/portal/announcements"))
  })

  // Authorship is the line for a manager now, not the role alone. The fixture announcement was
  // written by the owner (user-1), so this manager (user-2) still only gets the preview.
  it("shows just the preview card for a location manager who did not write it", async () => {
    global.fetch = jest.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url === "/api/proxy/announcements/ann-1") {
        return { ok: true, status: 200, json: async () => announcement } as Response
      }
      if (url === "/api/proxy/users/me") {
        return { ok: true, status: 200, json: async () => locationManager } as Response
      }
      throw new Error(`Unhandled fetch in test: ${url}`)
    }) as jest.Mock

    renderWithClient(<AnnouncementDetailPage />)

    expect(await screen.findByText("Kiosk screen")).toBeInTheDocument()
    expect(screen.getAllByText("Active Promo").length).toBeGreaterThan(0)
    expect(screen.queryByDisplayValue("Active Promo")).not.toBeInTheDocument()
    expect(screen.queryByText("Repeat")).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: /^delete$/i })).not.toBeInTheDocument()
    expect(
      screen.getByText(/Someone else created this one, so it isn't yours to change/),
    ).toBeInTheDocument()
  })

  // The other half of the same rule: they may change what they wrote themselves.
  it("gives a location manager the full edit form for an announcement they created", async () => {
    global.fetch = jest.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url === "/api/proxy/announcements/ann-1") {
        return {
          ok: true,
          status: 200,
          json: async () => ({ ...announcement, createdById: locationManager.id }),
        } as Response
      }
      if (url === "/api/proxy/locations") {
        return { ok: true, status: 200, json: async () => locations } as Response
      }
      if (url === "/api/proxy/users/me") {
        return { ok: true, status: 200, json: async () => locationManager } as Response
      }
      throw new Error(`Unhandled fetch in test: ${url}`)
    }) as jest.Mock

    renderWithClient(<AnnouncementDetailPage />)

    expect(await screen.findByDisplayValue("Active Promo")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Delete Active Promo" })).toBeInTheDocument()
  })

  // A platform-wide broadcast belongs to Saverlly staff, whoever is looking at it.
  it("keeps a broadcast read-only even for its own author", async () => {
    mockParamsId = "ann-2"
    global.fetch = jest.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url === "/api/proxy/announcements/ann-2") {
        return {
          ok: true,
          status: 200,
          json: async () => ({ ...broadcast, createdById: owner.id }),
        } as Response
      }
      if (url === "/api/proxy/locations") {
        return { ok: true, status: 200, json: async () => locations } as Response
      }
      if (url === "/api/proxy/users/me") {
        return { ok: true, status: 200, json: async () => owner } as Response
      }
      throw new Error(`Unhandled fetch in test: ${url}`)
    }) as jest.Mock

    renderWithClient(<AnnouncementDetailPage />)

    expect(await screen.findByText(/Only Saverlly staff can change it/)).toBeInTheDocument()
    expect(screen.queryByDisplayValue("Platform Broadcast")).not.toBeInTheDocument()
  })

  it("shows just the preview card (no edit form, no schedule/targeting, no delete button) for a kiosk owner viewing a platform-wide broadcast", async () => {
    global.fetch = jest.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url === "/api/proxy/announcements/ann-2") {
        return { ok: true, status: 200, json: async () => broadcast } as Response
      }
      if (url === "/api/proxy/users/me") {
        return { ok: true, status: 200, json: async () => owner } as Response
      }
      throw new Error(`Unhandled fetch in test: ${url}`)
    }) as jest.Mock
    mockParamsId = "ann-2"

    renderWithClient(<AnnouncementDetailPage />)

    expect(await screen.findByText("Kiosk screen")).toBeInTheDocument()
    expect(screen.getAllByText("Platform Broadcast").length).toBeGreaterThan(0)
    expect(screen.queryByDisplayValue("Platform Broadcast")).not.toBeInTheDocument()
    expect(screen.queryByText("Repeat")).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: /^delete$/i })).not.toBeInTheDocument()
  })
})
