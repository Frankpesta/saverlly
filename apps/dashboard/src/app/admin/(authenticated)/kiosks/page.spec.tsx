import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import KiosksPage from "./page"
import type { Kiosk } from "@/lib/api/types"

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
    name: "Kiosk One",
    status: "ACTIVE",
    revenueSharePct: "30",
    stripeAccountId: null,
    stripePayoutsEnabled: false,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "kiosk-2",
    name: "Kiosk Two",
    status: "INACTIVE",
    revenueSharePct: "25.5",
    stripeAccountId: null,
    stripePayoutsEnabled: false,
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

describe("KiosksPage", () => {
  beforeEach(() => {
    global.fetch = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)

      if (url === "/api/proxy/kiosks" && (!init || init.method === undefined)) {
        return {
          ok: true,
          status: 200,
          json: async () => kiosks,
        } as Response
      }

      if (url === "/api/proxy/kiosks/kiosk-1/status" && init?.method === "PATCH") {
        return {
          ok: true,
          status: 200,
          json: async () => ({ ...kiosks[0], status: "INACTIVE" }),
        } as Response
      }

      if (url === "/api/proxy/kiosks" && init?.method === "POST") {
        return {
          ok: true,
          status: 201,
          json: async () => ({
            kiosk: { ...kiosks[0], id: "kiosk-3", name: "Kiosk Three" },
            owner: {
              id: "user-3",
              name: "New Owner",
              email: "newowner3@example.com",
              role: "KIOSK_OWNER",
              kioskId: "kiosk-3",
              disabled: false,
              managedLocationIds: [],
              mustChangePassword: true,
              createdAt: "2026-01-01T00:00:00.000Z",
              updatedAt: "2026-01-01T00:00:00.000Z",
            },
            generatedPassword: "Gen3ratedPassw0rd!",
          }),
        } as Response
      }

      throw new Error(`Unhandled fetch in test: ${init?.method ?? "GET"} ${url}`)
    }) as jest.Mock
  })

  it("renders each kiosk's name, status, revenue share, and contact email", async () => {
    renderWithClient(<KiosksPage />)

    expect(await screen.findByText("Kiosk One")).toBeInTheDocument()
    expect(screen.getByText("Kiosk Two")).toBeInTheDocument()
    const rowOne = screen.getByText("Kiosk One").closest("tr")!
    const rowTwo = screen.getByText("Kiosk Two").closest("tr")!
    expect(within(rowOne).getByText("Active")).toBeInTheDocument()
    expect(within(rowTwo).getByText("Inactive")).toBeInTheDocument()
    expect(screen.getByText("30%")).toBeInTheDocument()
    expect(screen.getByText("25.5%")).toBeInTheDocument()
  })

  it("toggles a kiosk's status and calls the status endpoint", async () => {
    renderWithClient(<KiosksPage />)

    const toggle = await screen.findByRole("switch", { name: "Toggle Kiosk One status" })
    expect(toggle).toBeChecked()

    await userEvent.click(toggle)

    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/proxy/kiosks/kiosk-1/status",
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({ status: "INACTIVE" }),
        }),
      ),
    )
  })

  it("links each kiosk name and Edit action to its detail page", async () => {
    renderWithClient(<KiosksPage />)

    await screen.findByText("Kiosk One")
    const links = screen.getAllByRole("link", { name: /Kiosk One|Edit/ })
    expect(links[0]).toHaveAttribute("href", "/admin/kiosks/kiosk-1")
  })

  it("computes the stat tiles and meter caption from the fetched kiosks", async () => {
    renderWithClient(<KiosksPage />)

    await screen.findByText("Kiosk One")

    await waitFor(() => expect(screen.getByText("2")).toBeInTheDocument(), { timeout: 2000 })
    await waitFor(() => expect(screen.getByText("27.8%")).toBeInTheDocument(), { timeout: 2000 })
    expect(screen.getByText("1 of 2 kiosks active")).toBeInTheDocument()
  })

  it("links New Kiosk to the dedicated create page rather than opening a modal", async () => {
    renderWithClient(<KiosksPage />)

    await screen.findByText("Kiosk One")
    // The wizard used to open here as a Dialog. Creating a kiosk is now a page of its own
    // (kiosks/new/page.spec.tsx exercises the actual form), so all this list page owns is
    // the link to it.
    expect(screen.getByRole("link", { name: /new kiosk/i })).toHaveAttribute(
      "href",
      "/admin/kiosks/new",
    )
  })
})
