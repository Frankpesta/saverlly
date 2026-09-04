import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import NewPortalLocationPage from "./page"

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

function renderWithClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>)
}

describe("NewPortalLocationPage", () => {
  beforeEach(() => {
    mockPush.mockClear()
    global.fetch = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      const method = init?.method ?? "GET"
      if (url === "/api/proxy/locations" && method === "POST") {
        return {
          ok: true,
          status: 201,
          json: async () => ({ id: "loc-2", name: "Uptown" }),
        } as Response
      }
      throw new Error(`Unhandled fetch in test: ${method} ${url}`)
    }) as jest.Mock
  })

  it("renders State before City, matching the client's requested field order", () => {
    renderWithClient(<NewPortalLocationPage />)

    const labels = screen.getAllByText(/^(State|City)$/).map((el) => el.textContent)
    expect(labels).toEqual(["State", "City"])
  })

  it("will not submit an empty form", async () => {
    const user = userEvent.setup()
    renderWithClient(<NewPortalLocationPage />)

    await user.click(screen.getByRole("button", { name: /create location/i }))

    expect(await screen.findByText("Address is required")).toBeInTheDocument()
    expect(global.fetch).not.toHaveBeenCalled()
  })

  // More interaction steps than the default 5000ms budget covers, since State and City are
  // each their own combobox popover (open, search, pick), not plain text inputs.
  it("fills the form and posts without a kioskId, which the backend infers from the owner", async () => {
    const user = userEvent.setup()
    renderWithClient(<NewPortalLocationPage />)

    await user.type(screen.getByLabelText("Name"), "Uptown")
    await user.type(screen.getByLabelText("Address"), "2 Elm St")

    await user.click(screen.getByRole("combobox", { name: "State" }))
    await user.click(await screen.findByRole("option", { name: "Illinois (IL)" }))

    await user.click(screen.getByRole("combobox", { name: "City" }))
    await user.type(screen.getByPlaceholderText("Type a city..."), "Springfield")
    await user.click(await screen.findByRole("option", { name: "Springfield" }))

    await user.type(screen.getByLabelText("Zip"), "62701")
    await user.click(screen.getByRole("button", { name: /create location/i }))

    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/proxy/locations",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            name: "Uptown",
            address: "2 Elm St",
            city: "Springfield",
            state: "IL",
            zip: "62701",
          }),
        }),
      ),
    )
    expect(mockPush).toHaveBeenCalledWith("/portal/locations/loc-2")
  }, 20000)
})
