import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import NewAnnouncementPage from "./page"
import type { Location } from "@/lib/api/types"

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

function renderWithClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>)
}

function postBody() {
  const [, init] = (global.fetch as jest.Mock).mock.calls.find(([, i]) => i?.method === "POST")
  return JSON.parse(init.body)
}

describe("NewAnnouncementPage", () => {
  beforeEach(() => {
    push.mockClear()
    global.fetch = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      const method = init?.method ?? "GET"
      if (url === "/api/proxy/locations" && method === "GET") {
        return { ok: true, status: 200, json: async () => locations } as Response
      }
      if (url === "/api/proxy/announcements" && method === "POST") {
        return { ok: true, status: 201, json: async () => ({ id: "ann-3" }) } as Response
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

  // The whole point of the page: content, schedule and targeting are all reachable at once,
  // with no Continue button gating them the way the dialog wizard it replaced did.
  it("shows every field on one page and submits without any step navigation", async () => {
    renderWithClient(<NewAnnouncementPage />)

    await userEvent.type(screen.getByLabelText("Title"), "Weekend Deal")
    await userEvent.type(screen.getByLabelText("Internal note"), "20% off this weekend only.")
    expect(screen.getByLabelText("Starts")).toBeInTheDocument()
    expect(screen.getByLabelText("All locations")).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: /continue/i })).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole("button", { name: /create announcement/i }))

    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/proxy/announcements",
        expect.objectContaining({ method: "POST" }),
      ),
    )

    const body = postBody()
    expect(body.title).toBe("Weekend Deal")
    expect(body.body).toBe("20% off this weekend only.")
    expect(body.repeatPolicy).toBe("ONCE")
    expect(body.locationIds).toEqual([])

    await waitFor(() => expect(push).toHaveBeenCalledWith("/portal/announcements"))
  })

  it("blocks submission and keeps the user on the page when required fields are empty", async () => {
    renderWithClient(<NewAnnouncementPage />)

    await userEvent.click(screen.getByRole("button", { name: /create announcement/i }))

    expect(await screen.findByText("Title is required")).toBeInTheDocument()
    // The internal note is deliberately not required: it was a mandatory field labelled "Body"
    // that read like kiosk copy, when the kiosk never showed it.
    expect(screen.queryByText(/note is required/i)).not.toBeInTheDocument()
    expect(
      (global.fetch as jest.Mock).mock.calls.some(([, i]) => i?.method === "POST"),
    ).toBe(false)
    expect(push).not.toHaveBeenCalled()
  })

  it("drops an uploaded image onto the canvas and into the kiosk document", async () => {
    renderWithClient(<NewAnnouncementPage />)

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement
    expect(fileInput).toHaveAttribute("id", "ann-canvas-image")

    await userEvent.upload(fileInput, new File(["fake-bytes"], "promo.png", { type: "image/png" }))

    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/proxy/announcements/upload-image",
        expect.objectContaining({ method: "POST" }),
      ),
    )

    const uploadedUrl = "http://localhost:3000/uploads/announcements/uploaded.png"
    // Browser-facing surfaces render the image through the dashboard's own proxy: the backend
    // serves uploads over plain HTTP, and a raw http:// URL on the HTTPS dashboard is mixed
    // content, which the browser drops without a word. The raw URL is still what gets *saved*
    // and what the kiosk agent renders. Only these two views rewrite it.
    const encoded = encodeURIComponent(uploadedUrl)

    // The upload becomes a real image element on the canvas, painted via background-image by the
    // shared `layoutElementStyle`. The same style function the kiosk renderer uses.
    await waitFor(() => {
      const stage = screen.getByTestId("announcement-stage")
      const painted = Array.from(stage.querySelectorAll<HTMLElement>("div")).some((node) =>
        node.style.backgroundImage.includes(`/api/image-proxy?url=${encoded}`),
      )
      expect(painted).toBe(true)
    })

    // And it reaches the actual document the kiosk will load, not just the editor's own view.
    const frame = screen.getByTitle("Kiosk preview") as HTMLIFrameElement
    expect(frame.getAttribute("srcdoc")).toContain(encoded)
    // The bug guard: an un-rewritten http:// URL here is one the browser silently refuses.
    expect(frame.getAttribute("srcdoc")).not.toContain(`url("${uploadedUrl}")`)
  })

  it("leaves the page via Cancel rather than a modal close", async () => {
    renderWithClient(<NewAnnouncementPage />)

    expect(screen.getByRole("link", { name: "Cancel" })).toHaveAttribute(
      "href",
      "/portal/announcements",
    )
  })
})
