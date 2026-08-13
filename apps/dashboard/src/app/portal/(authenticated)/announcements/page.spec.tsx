import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
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
    title: "Active Promo",
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
    kioskId: "kiosk-1",
    locationIds: ["loc-1"],
    title: "Future Sale",
    body: "Coming soon",
    mediaUrl: null,
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
      if (url === "/api/proxy/announcements" && method === "POST") {
        return {
          ok: true,
          status: 201,
          json: async () => ({ ...announcements[0], id: "ann-3", title: "Weekend Deal" }),
        } as Response
      }
      if (url === "/api/proxy/announcements/upload-image" && method === "POST") {
        return {
          ok: true,
          status: 201,
          json: async () => ({ url: "http://localhost:3000/uploads/announcements/uploaded.png" }),
        } as Response
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

  it("walks the New Announcement wizard across all three steps and submits", async () => {
    renderWithClient(<AnnouncementsPage />)

    await userEvent.click(await screen.findByRole("button", { name: /new announcement/i }))

    await userEvent.type(screen.getByLabelText("Title"), "Weekend Deal")
    await userEvent.type(screen.getByLabelText("Body"), "20% off this weekend only.")
    await userEvent.click(screen.getByRole("button", { name: /continue/i }))

    await screen.findByLabelText("Starts")
    await userEvent.click(screen.getByRole("button", { name: /continue/i }))

    const dialog = await screen.findByRole("dialog")
    await within(dialog).findByText("All locations")
    await userEvent.click(within(dialog).getByRole("button", { name: /create announcement/i }))

    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/proxy/announcements",
        expect.objectContaining({ method: "POST" }),
      ),
    )

    const [, init] = (global.fetch as jest.Mock).mock.calls.find(
      ([, i]) => i?.method === "POST",
    )
    const body = JSON.parse(init.body)
    expect(body.title).toBe("Weekend Deal")
    expect(body.body).toBe("20% off this weekend only.")
    expect(body.repeatPolicy).toBe("ONCE")
    expect(body.locationIds).toEqual([])
  })

  it("uploads an image and fills the mediaUrl field with the returned url", async () => {
    renderWithClient(<AnnouncementsPage />)

    await userEvent.click(await screen.findByRole("button", { name: /new announcement/i }))
    await screen.findByLabelText("Image (optional)")

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement
    const file = new File(["fake-bytes"], "promo.png", { type: "image/png" })
    await userEvent.upload(fileInput, file)

    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/proxy/announcements/upload-image",
        expect.objectContaining({ method: "POST" }),
      ),
    )

    await waitFor(() =>
      expect(
        (screen.getByLabelText("Image (optional)") as HTMLInputElement).value,
      ).toBe("http://localhost:3000/uploads/announcements/uploaded.png"),
    )
  })
})
