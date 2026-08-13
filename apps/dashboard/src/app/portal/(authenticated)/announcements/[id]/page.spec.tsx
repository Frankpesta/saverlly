import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import AnnouncementDetailPage from "./page"
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

const push = jest.fn()
jest.mock("next/navigation", () => ({
  useParams: () => ({ id: "ann-1" }),
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
    country: "US",
    latitude: null,
    longitude: null,
    tags: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
]

const announcement: Announcement = {
  id: "ann-1",
  kioskId: "kiosk-1",
  locationIds: [],
  title: "Active Promo",
  body: "Save big!",
  mediaUrl: null,
  startAt: "2026-01-01T00:00:00.000Z",
  endAt: "2026-06-01T00:00:00.000Z",
  repeatPolicy: "EVERY_LOGIN",
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

describe("AnnouncementDetailPage", () => {
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
    await userEvent.click(screen.getByRole("button", { name: /^delete$/i }))

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
})
