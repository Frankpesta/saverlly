import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import NewLocationPage from "./page"
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

const mockPush = jest.fn()
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}))

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
]

function renderWithClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>)
}

describe("NewLocationPage", () => {
  beforeEach(() => {
    mockPush.mockClear()
    global.fetch = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      const method = init?.method ?? "GET"
      if (url === "/api/proxy/kiosks" && method === "GET") {
        return { ok: true, status: 200, json: async () => kiosks } as Response
      }
      if (url === "/api/proxy/locations" && method === "POST") {
        return {
          ok: true,
          status: 201,
          json: async () => ({
            id: "loc-2",
            kioskId: "kiosk-1",
            name: "Uptown",
            address: "2 Elm St",
            city: "Springfield",
            state: "IL",
            zip: "00000",
            latitude: null,
            longitude: null,
            tags: [],
            locationSetupCode: null,
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
          }),
        } as Response
      }
      throw new Error(`Unhandled fetch in test: ${method} ${url}`)
    }) as jest.Mock
  })

  it("requires a kiosk to be picked before it will submit", async () => {
    const user = userEvent.setup()
    renderWithClient(<NewLocationPage />)

    await user.click(screen.getByRole("button", { name: /create location/i }))

    expect(await screen.findByText("Select a kiosk", { selector: "p" })).toBeInTheDocument()
    expect(global.fetch).not.toHaveBeenCalledWith(
      "/api/proxy/locations",
      expect.objectContaining({ method: "POST" }),
    )
  })

  it("renders State before City, matching the client's requested field order", () => {
    renderWithClient(<NewLocationPage />)

    const labels = screen.getAllByText(/^(State|City)$/).map((el) => el.textContent)
    expect(labels).toEqual(["State", "City"])
  })

  // More interaction steps than the default 5000ms budget comfortably covers, since Kiosk/
  // State/City are each their own combobox popover (open, search, pick), not plain text inputs.
  it("fills the form, picks a state to filter city options, and submits", async () => {
    const user = userEvent.setup()
    renderWithClient(<NewLocationPage />)

    await user.click(screen.getByRole("combobox", { name: "Kiosk" }))
    await user.click(await screen.findByRole("option", { name: "Kiosk One" }))

    await user.type(screen.getByLabelText("Name"), "Uptown")
    await user.type(screen.getByLabelText("Address"), "2 Elm St")

    await user.click(screen.getByRole("combobox", { name: "State" }))
    await user.click(await screen.findByRole("option", { name: "Illinois (IL)" }))

    await user.click(screen.getByRole("combobox", { name: "City" }))
    await user.type(screen.getByPlaceholderText("Type a city..."), "Springfield")
    await user.click(await screen.findByRole("option", { name: "Springfield" }))

    await user.type(screen.getByLabelText("Zip"), "00000")
    await user.click(screen.getByRole("button", { name: /create location/i }))

    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/proxy/locations",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            kioskId: "kiosk-1",
            name: "Uptown",
            address: "2 Elm St",
            city: "Springfield",
            state: "IL",
            zip: "00000",
          }),
        }),
      ),
    )
    expect(mockPush).toHaveBeenCalledWith("/admin/locations/loc-2")
  }, 20000)

  it("accepts a ZIP+4 or a letter/dash postal code", async () => {
    const user = userEvent.setup()
    renderWithClient(<NewLocationPage />)

    const zip = screen.getByLabelText("Zip")
    await user.type(zip, "a1a 1a1")
    expect(zip).toHaveValue("A1A 1A1")
  })
})
