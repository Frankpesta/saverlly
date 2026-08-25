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
    contactEmail: "owner1@example.com",
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
    contactEmail: "owner2@example.com",
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
    expect(screen.getByText("owner1@example.com")).toBeInTheDocument()
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

  it("walks the New Kiosk wizard's steps, submits the create request, and reveals the generated password", async () => {
    renderWithClient(<KiosksPage />)

    await screen.findByText("Kiosk One")
    await userEvent.click(screen.getByRole("button", { name: /new kiosk/i }))

    await userEvent.type(screen.getByLabelText("Name"), "Kiosk Three")
    await userEvent.type(screen.getByLabelText("Contact email"), "owner3@example.com")
    await userEvent.click(screen.getByRole("button", { name: /continue/i }))

    const revenueInput = await screen.findByLabelText("Revenue share (%)")
    await userEvent.clear(revenueInput)
    await userEvent.type(revenueInput, "40")
    await userEvent.click(screen.getByRole("button", { name: /continue/i }))

    const ownerEmailInput = await screen.findByLabelText("Owner email")
    await userEvent.type(ownerEmailInput, "newowner3@example.com")
    await userEvent.click(screen.getByRole("button", { name: /create kiosk/i }))

    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/proxy/kiosks",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            name: "Kiosk Three",
            contactEmail: "owner3@example.com",
            revenueSharePct: 40,
            owner: { email: "newowner3@example.com" },
          }),
        }),
      ),
    )

    expect(await screen.findByText("Gen3ratedPassw0rd!")).toBeInTheDocument()
    await userEvent.click(screen.getByRole("button", { name: /done/i }))
  })
})
