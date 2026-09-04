import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import NewTeamMemberPage from "./page"
import type { Location, UserProfile } from "@/lib/api/types"

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

const owner: UserProfile = {
  id: "user-1",
  name: "Jane Owner",
  avatarUrl: null,
  email: "owner@example.com",
  role: "KIOSK_OWNER",
  kioskId: "kiosk-1",
}

const locations: Location[] = [
  {
    id: "loc-1",
    kioskId: "kiosk-1",
    name: "Downtown",
    address: "1 Main St",
    city: "Springfield",
    state: "IL",
    zip: "62701",
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

function mockFetch() {
  global.fetch = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    const method = init?.method ?? "GET"
    if (url === "/api/proxy/users/me") {
      return { ok: true, status: 200, json: async () => owner } as Response
    }
    if (url === "/api/proxy/locations") {
      return { ok: true, status: 200, json: async () => locations } as Response
    }
    if (url === "/api/proxy/kiosks/kiosk-1/users" && method === "POST") {
      return {
        ok: true,
        status: 201,
        json: async () => ({
          user: { id: "user-9", name: "New Person", email: "new@example.com" },
          generatedPassword: "Gen3ratedPassw0rd!",
        }),
      } as Response
    }
    throw new Error(`Unhandled fetch in test: ${method} ${url}`)
  }) as jest.Mock
}

describe("NewTeamMemberPage", () => {
  beforeEach(mockFetch)

  it("has no role picker, since a kiosk owner may only create location managers", async () => {
    renderWithClient(<NewTeamMemberPage />)

    await screen.findByLabelText("Name")
    expect(screen.queryByRole("combobox", { name: /role/i })).not.toBeInTheDocument()
  })

  // The client asked for locations to be assignable when the person is created, rather than
  // only afterwards through a second edit form.
  it("assigns locations as part of creating the account", async () => {
    const user = userEvent.setup()
    renderWithClient(<NewTeamMemberPage />)

    await user.type(await screen.findByLabelText("Name"), "New Person")
    await user.type(screen.getByLabelText("Email"), "new@example.com")
    await user.click(await screen.findByRole("checkbox", { name: /Downtown/ }))
    await user.click(screen.getByRole("button", { name: "Add team member" }))

    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/proxy/kiosks/kiosk-1/users",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            name: "New Person",
            email: "new@example.com",
            role: "LOCATION_MANAGER",
            managedLocationIds: ["loc-1"],
          }),
        }),
      ),
    )
  })

  it("reveals the generated password on a persistent result panel", async () => {
    const user = userEvent.setup()
    renderWithClient(<NewTeamMemberPage />)

    await user.type(await screen.findByLabelText("Name"), "New Person")
    await user.type(screen.getByLabelText("Email"), "new@example.com")
    await user.click(screen.getByRole("button", { name: "Add team member" }))

    expect(await screen.findByText("Gen3ratedPassw0rd!")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /copy password/i })).toBeInTheDocument()
  })

  it("omits managedLocationIds when nothing is picked", async () => {
    const user = userEvent.setup()
    renderWithClient(<NewTeamMemberPage />)

    await user.type(await screen.findByLabelText("Name"), "New Person")
    await user.type(screen.getByLabelText("Email"), "new@example.com")
    await user.click(screen.getByRole("button", { name: "Add team member" }))

    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/proxy/kiosks/kiosk-1/users",
        expect.objectContaining({
          body: JSON.stringify({
            name: "New Person",
            email: "new@example.com",
            role: "LOCATION_MANAGER",
          }),
        }),
      ),
    )
  })
})
