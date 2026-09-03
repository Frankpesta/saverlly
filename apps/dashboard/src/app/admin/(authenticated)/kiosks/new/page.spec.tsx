import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import NewKioskPage from "./page"

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

describe("NewKioskPage", () => {
  beforeEach(() => {
    mockPush.mockClear()
    global.fetch = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url === "/api/proxy/kiosks" && init?.method === "POST") {
        return {
          ok: true,
          status: 201,
          json: async () => ({
            kiosk: { id: "kiosk-3", name: "Kiosk Three", status: "ACTIVE", revenueSharePct: "40" },
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

  it("renders every field on one page rather than a stepped wizard", () => {
    renderWithClient(<NewKioskPage />)

    // The whole point of flattening the wizard: nothing is hidden behind a Continue button.
    expect(screen.getByLabelText("Kiosk name")).toBeInTheDocument()
    expect(screen.getByLabelText("Revenue share (%)")).toBeInTheDocument()
    expect(screen.getByLabelText("Owner name")).toBeInTheDocument()
    expect(screen.getByLabelText("Owner email")).toBeInTheDocument()
  })

  it("submits the create request and shows the generated password as a result panel", async () => {
    const user = userEvent.setup()
    renderWithClient(<NewKioskPage />)

    await user.type(screen.getByLabelText("Kiosk name"), "Kiosk Three")
    const revenueInput = screen.getByLabelText("Revenue share (%)")
    await user.clear(revenueInput)
    await user.type(revenueInput, "40")
    await user.type(screen.getByLabelText("Owner name"), "New Owner")
    await user.type(screen.getByLabelText("Owner email"), "newowner3@example.com")
    await user.click(screen.getByRole("button", { name: /create kiosk/i }))

    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/proxy/kiosks",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            name: "Kiosk Three",
            revenueSharePct: 40,
            owner: { name: "New Owner", email: "newowner3@example.com" },
          }),
        }),
      ),
    )

    expect(await screen.findByText("Gen3ratedPassw0rd!")).toBeInTheDocument()
    expect(screen.getByRole("link", { name: /go to kiosk/i })).toHaveAttribute(
      "href",
      "/admin/kiosks/kiosk-3",
    )
    // The old wizard's form fields are gone once the result panel replaces the form.
    expect(screen.queryByLabelText("Kiosk name")).not.toBeInTheDocument()
  })
})
