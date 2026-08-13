import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import AdminAnnouncementsPage from "./page"
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

const announcements: Announcement[] = [
  {
    id: "ann-1",
    kioskId: "kiosk-1",
    locationIds: [],
    title: "Kiosk Promo",
    body: "Save big!",
    mediaUrl: null,
    startAt: "2020-01-01T00:00:00.000Z",
    endAt: "2099-01-01T00:00:00.000Z",
    repeatPolicy: "EVERY_LOGIN",
    maxDisplayCount: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "ann-2",
    kioskId: null,
    locationIds: [],
    title: "Platform Broadcast",
    body: "Everyone sees this",
    mediaUrl: null,
    startAt: "2020-01-01T00:00:00.000Z",
    endAt: "2099-01-01T00:00:00.000Z",
    repeatPolicy: "ONCE",
    maxDisplayCount: null,
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

describe("AdminAnnouncementsPage", () => {
  beforeEach(() => {
    global.fetch = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      const method = init?.method ?? "GET"
      if (url === "/api/proxy/announcements" && method === "GET") {
        return { ok: true, status: 200, json: async () => announcements } as Response
      }
      if (url === "/api/proxy/kiosks" && method === "GET") {
        return { ok: true, status: 200, json: async () => kiosks } as Response
      }
      if (url === "/api/proxy/locations" && method === "GET") {
        return { ok: true, status: 200, json: async () => locations } as Response
      }
      if (url === "/api/proxy/announcements" && method === "POST") {
        return {
          ok: true,
          status: 201,
          json: async () => ({ ...announcements[1], id: "ann-3", title: "Platform Wide Sale" }),
        } as Response
      }
      throw new Error(`Unhandled fetch in test: ${method} ${url}`)
    }) as jest.Mock
  })

  it("shows the owning kiosk for a normal announcement and an 'All kiosks' badge for a broadcast", async () => {
    renderWithClient(<AdminAnnouncementsPage />)

    const kioskRow = (await screen.findByText("Kiosk Promo")).closest("tr")!
    expect(within(kioskRow).getByText("Main Street Kiosk")).toBeInTheDocument()

    const broadcastRow = screen.getByText("Platform Broadcast").closest("tr")!
    expect(within(broadcastRow).getByText("All kiosks")).toBeInTheDocument()
    expect(within(broadcastRow).getByText("Everyone")).toBeInTheDocument()
  })

  it("skips the Kiosk and Targeting steps when Broadcast to all kiosks is on", async () => {
    renderWithClient(<AdminAnnouncementsPage />)

    await userEvent.click(await screen.findByRole("button", { name: /new announcement/i }))
    await userEvent.click(screen.getByRole("switch", { name: /broadcast to all kiosks/i }))
    await userEvent.type(screen.getByLabelText("Title"), "Platform Wide Sale")
    await userEvent.type(screen.getByLabelText("Body"), "Everyone gets a discount.")
    await userEvent.click(screen.getByRole("button", { name: /continue/i }))

    // With broadcast on, Content -> Schedule directly (no Kiosk step in between).
    await screen.findByLabelText("Starts")
    await userEvent.click(screen.getByRole("button", { name: /create announcement/i }))

    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/proxy/announcements",
        expect.objectContaining({ method: "POST" }),
      ),
    )
    const [, init] = (global.fetch as jest.Mock).mock.calls.find(([, i]) => i?.method === "POST")
    const body = JSON.parse(init.body)
    expect(body.broadcast).toBe(true)
    expect(body.kioskId).toBeUndefined()
  })

  it("requires a kiosk before continuing when broadcast is off", async () => {
    renderWithClient(<AdminAnnouncementsPage />)

    await userEvent.click(await screen.findByRole("button", { name: /new announcement/i }))
    await userEvent.type(screen.getByLabelText("Title"), "Kiosk Only Promo")
    await userEvent.type(screen.getByLabelText("Body"), "Local deal.")
    await userEvent.click(screen.getByRole("button", { name: /continue/i }))

    // Now on the Kiosk step — Continue is disabled until a kiosk is picked.
    expect(screen.getByRole("button", { name: /continue/i })).toBeDisabled()

    await userEvent.click(screen.getByRole("combobox"))
    await userEvent.click(await screen.findByRole("option", { name: "Main Street Kiosk" }))
    expect(screen.getByRole("button", { name: /continue/i })).toBeEnabled()
  })
})
