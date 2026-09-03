import { render, screen, within } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import AnnouncementsPage from "./page"
import type { Announcement, Location } from "@/lib/api/types"

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

const announcements: Announcement[] = [
  {
    id: "ann-1",
    kioskId: "kiosk-1",
    locationIds: [],
    title: "Active Promo",
    body: "Save big!",
    mediaUrl: null,
    layout: null,
    startAt: "2020-01-01T00:00:00.000Z",
    endAt: "2099-01-01T00:00:00.000Z",
    repeatPolicy: "EVERY_LOGIN",
    maxDisplayCount: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "ann-2",
    kioskId: "kiosk-1",
    locationIds: ["loc-1"],
    title: "Future Sale",
    body: "Coming soon",
    mediaUrl: null,
    layout: null,
    startAt: "2099-01-01T00:00:00.000Z",
    endAt: "2099-06-01T00:00:00.000Z",
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

describe("AnnouncementsPage", () => {
  beforeEach(() => {
    global.fetch = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      const method = init?.method ?? "GET"
      if (url === "/api/proxy/announcements" && method === "GET") {
        return { ok: true, status: 200, json: async () => announcements } as Response
      }
      if (url === "/api/proxy/locations" && method === "GET") {
        return { ok: true, status: 200, json: async () => locations } as Response
      }
      throw new Error(`Unhandled fetch in test: ${method} ${url}`)
    }) as jest.Mock
  })

  it("computes Active/Scheduled status and location targeting summary", async () => {
    renderWithClient(<AnnouncementsPage />)

    const activeRow = (await screen.findByText("Active Promo")).closest("tr")!
    expect(within(activeRow).getByText("Active")).toBeInTheDocument()
    expect(within(activeRow).getByText("All locations")).toBeInTheDocument()

    const futureRow = screen.getByText("Future Sale").closest("tr")!
    expect(within(futureRow).getByText("Scheduled")).toBeInTheDocument()
    expect(within(futureRow).getByText("1 of 1")).toBeInTheDocument()
  })

  // Creation moved off this page onto /portal/announcements/new. The list only has to point at
  // it now. The form itself is covered by new/page.spec.tsx.
  it("sends both the header action and the empty state to the dedicated create page", async () => {
    renderWithClient(<AnnouncementsPage />)

    expect(await screen.findByRole("link", { name: /new announcement/i })).toHaveAttribute(
      "href",
      "/portal/announcements/new",
    )
    expect(screen.queryByRole("button", { name: /new announcement/i })).not.toBeInTheDocument()
  })

  it("offers the create page from the empty state when there is nothing to list", async () => {
    ;(global.fetch as jest.Mock).mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url === "/api/proxy/announcements" || url === "/api/proxy/locations") {
        return { ok: true, status: 200, json: async () => [] } as Response
      }
      throw new Error(`Unhandled fetch in test: ${url}`)
    })

    renderWithClient(<AnnouncementsPage />)

    expect(await screen.findByText(/no announcements yet/i)).toBeInTheDocument()
    expect(screen.getByRole("link", { name: /create your first one/i })).toHaveAttribute(
      "href",
      "/portal/announcements/new",
    )
  })
})
