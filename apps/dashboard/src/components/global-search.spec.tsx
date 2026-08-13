import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { GlobalSearch } from "./global-search"
import type { SearchResult } from "@/lib/api/types"

let currentPathname = "/admin/overview"
const push = jest.fn()
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
  usePathname: () => currentPathname,
}))

const allTypeResults: SearchResult[] = [
  { type: "location", id: "loc-1", title: "Downtown Branch", subtitle: "1 Main St, Springfield" },
  { type: "device", id: "dev-1", title: "Computer 4", subtitle: "Device Location" },
  { type: "announcement", id: "ann-1", title: "Summer Sale", subtitle: "Platform-wide" },
  { type: "kiosk", id: "kiosk-1", title: "Acme Kiosk", subtitle: "ACTIVE" },
  { type: "merchant", id: "merch-1", title: "BigStore", subtitle: "bigstore.test" },
  { type: "coupon", id: "coupon-1", title: "SAVE10", subtitle: "Coupon Merchant" },
]

function renderWithClient() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <GlobalSearch />
    </QueryClientProvider>,
  )
}

function searchFetchCalls() {
  return (global.fetch as jest.Mock).mock.calls.filter(([url]: [string]) =>
    String(url).startsWith("/api/proxy/search"),
  )
}

describe("GlobalSearch", () => {
  beforeEach(() => {
    currentPathname = "/admin/overview"
    push.mockClear()
    global.fetch = jest.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.startsWith("/api/proxy/search")) {
        return { ok: true, status: 200, json: async () => allTypeResults } as Response
      }
      throw new Error(`Unhandled fetch in test: ${url}`)
    }) as jest.Mock
  })

  it("renders the trigger button and opens the dialog on click", async () => {
    renderWithClient()

    expect(screen.queryByPlaceholderText("Search...")).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole("button", { name: /search/i }))

    expect(await screen.findByPlaceholderText("Search...")).toBeInTheDocument()
  })

  it("opens via Cmd+K from a closed state", async () => {
    renderWithClient()

    expect(screen.queryByPlaceholderText("Search...")).not.toBeInTheDocument()
    await userEvent.keyboard("{Meta>}k{/Meta}")

    expect(await screen.findByPlaceholderText("Search...")).toBeInTheDocument()
  })

  it("shows an idle hint and fires no request for fewer than 2 characters", async () => {
    renderWithClient()
    await userEvent.click(screen.getByRole("button", { name: /search/i }))

    const input = await screen.findByPlaceholderText("Search...")
    await userEvent.type(input, "a")

    expect(screen.getByText("Type at least 2 characters to search.")).toBeInTheDocument()
    await new Promise((r) => setTimeout(r, 300))
    expect(searchFetchCalls()).toHaveLength(0)
  })

  it("debounces rapid typing into a single request for the final query", async () => {
    renderWithClient()
    await userEvent.click(screen.getByRole("button", { name: /search/i }))

    const input = await screen.findByPlaceholderText("Search...")
    await userEvent.type(input, "Downtown")

    await waitFor(() => expect(searchFetchCalls()).toHaveLength(1), { timeout: 2000 })
    expect(searchFetchCalls()[0][0]).toBe("/api/proxy/search?q=Downtown")
  })

  it("renders an empty state when the query matches nothing", async () => {
    global.fetch = jest.fn(async () => ({ ok: true, status: 200, json: async () => [] }) as Response) as jest.Mock
    renderWithClient()
    await userEvent.click(screen.getByRole("button", { name: /search/i }))

    const input = await screen.findByPlaceholderText("Search...")
    await userEvent.type(input, "nothing")

    expect(await screen.findByText("No results for “nothing”.")).toBeInTheDocument()
  })

  it("groups results by type with the expected headings", async () => {
    renderWithClient()
    await userEvent.click(screen.getByRole("button", { name: /search/i }))

    const input = await screen.findByPlaceholderText("Search...")
    await userEvent.type(input, "test")

    expect(await screen.findByText("Downtown Branch")).toBeInTheDocument()
    for (const heading of ["Locations", "Devices", "Announcements", "Kiosks", "Merchants", "Coupons"]) {
      expect(screen.getByText(heading)).toBeInTheDocument()
    }
  })

  it.each([
    ["location", "Downtown Branch", "/admin/locations/loc-1"],
    ["device", "Computer 4", "/admin/devices"],
    ["announcement", "Summer Sale", "/admin/announcements/ann-1"],
    ["kiosk", "Acme Kiosk", "/admin/kiosks/kiosk-1"],
    ["merchant", "BigStore", "/admin/merchants/merch-1"],
    ["coupon", "SAVE10", "/admin/coupons"],
  ])("navigates to the right href for a %s result (admin)", async (_type, title, expectedHref) => {
    currentPathname = "/admin/overview"
    renderWithClient()
    await userEvent.click(screen.getByRole("button", { name: /search/i }))

    const input = await screen.findByPlaceholderText("Search...")
    await userEvent.type(input, "test")

    await userEvent.click(await screen.findByText(title))
    expect(push).toHaveBeenCalledWith(expectedHref)
  })

  it("builds portal-prefixed hrefs for location/announcement/device results under /portal", async () => {
    currentPathname = "/portal/overview"
    renderWithClient()
    await userEvent.click(screen.getByRole("button", { name: /search/i }))

    const input = await screen.findByPlaceholderText("Search...")
    await userEvent.type(input, "test")

    await userEvent.click(await screen.findByText("Downtown Branch"))
    expect(push).toHaveBeenCalledWith("/portal/locations/loc-1")
  })

  it("keeps kiosk/merchant results pinned to /admin even when opened from /portal", async () => {
    currentPathname = "/portal/overview"
    renderWithClient()
    await userEvent.click(screen.getByRole("button", { name: /search/i }))

    const input = await screen.findByPlaceholderText("Search...")
    await userEvent.type(input, "test")

    await userEvent.click(await screen.findByText("Acme Kiosk"))
    expect(push).toHaveBeenCalledWith("/admin/kiosks/kiosk-1")
  })
})
