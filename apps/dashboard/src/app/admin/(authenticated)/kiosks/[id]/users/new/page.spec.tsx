import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import NewKioskUserPage from "./page"
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

jest.mock("next/navigation", () => ({
  useParams: () => ({ id: "kiosk-1" }),
}))

const kiosk: Kiosk = {
  id: "kiosk-1",
  name: "Kiosk One",
  status: "ACTIVE",
  revenueSharePct: "30",
  stripeAccountId: null,
  stripePayoutsEnabled: false,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
}

function renderWithClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>)
}

describe("NewKioskUserPage", () => {
  beforeEach(() => {
    global.fetch = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url === "/api/proxy/kiosks/kiosk-1" && (!init || init.method === undefined)) {
        return { ok: true, status: 200, json: async () => kiosk } as Response
      }
      if (url === "/api/proxy/kiosks/kiosk-1/users" && init?.method === "POST") {
        return {
          ok: true,
          status: 201,
          json: async () => ({
            user: {
              id: "user-2",
              name: "New Manager",
              email: "manager@example.com",
              role: "LOCATION_MANAGER",
              kioskId: "kiosk-1",
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

  it("adds a new user and reveals the generated password as a result panel", async () => {
    const user = userEvent.setup()
    renderWithClient(<NewKioskUserPage />)

    await user.type(screen.getByLabelText("Name"), "New Manager")
    await user.type(screen.getByLabelText("Email"), "manager@example.com")
    await user.click(screen.getByRole("combobox"))
    await user.click(await screen.findByRole("option", { name: "Location manager" }))
    await user.click(screen.getByRole("button", { name: /^add user$/i }))

    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/proxy/kiosks/kiosk-1/users",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            name: "New Manager",
            email: "manager@example.com",
            role: "LOCATION_MANAGER",
          }),
        }),
      ),
    )

    expect(await screen.findByText("Gen3ratedPassw0rd!")).toBeInTheDocument()
    expect(screen.getByRole("link", { name: /back to kiosk/i })).toHaveAttribute(
      "href",
      "/admin/kiosks/kiosk-1",
    )
  })
})
