import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import EditTeamMemberPage from "./page"
import type { KioskUser, Location, UserProfile } from "@/lib/api/types"

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
  useParams: () => ({ id: "user-2" }),
  useRouter: () => ({ push: mockPush }),
}))

const owner: UserProfile = {
  id: "user-1",
  name: "Jane Owner",
  avatarUrl: null,
  email: "owner@example.com",
  role: "KIOSK_OWNER",
  kioskId: "kiosk-1",
}

const member: KioskUser = {
  id: "user-2",
  name: "Max Manager",
  avatarUrl: null,
  email: "manager@example.com",
  role: "LOCATION_MANAGER",
  kioskId: "kiosk-1",
  disabled: false,
  managedLocationIds: [],
  mustChangePassword: true,
  createdAt: "2026-01-03T00:00:00.000Z",
  updatedAt: "2026-01-03T00:00:00.000Z",
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

describe("EditTeamMemberPage", () => {
  beforeEach(() => {
    mockPush.mockClear()
    global.fetch = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      const method = init?.method ?? "GET"
      if (url === "/api/proxy/users/me") {
        return { ok: true, status: 200, json: async () => owner } as Response
      }
      if (url === "/api/proxy/kiosks/kiosk-1/users" && method === "GET") {
        return { ok: true, status: 200, json: async () => [member] } as Response
      }
      if (url === "/api/proxy/locations") {
        return { ok: true, status: 200, json: async () => locations } as Response
      }
      if (url === "/api/proxy/kiosks/kiosk-1/users/user-2" && method === "PATCH") {
        return {
          ok: true,
          status: 200,
          json: async () => ({ ...member, email: "renamed@example.com" }),
        } as Response
      }
      if (url === "/api/proxy/kiosks/kiosk-1/users/user-2" && method === "DELETE") {
        return { ok: true, status: 204, json: async () => undefined } as Response
      }
      if (url === "/api/proxy/kiosks/kiosk-1/users/user-2/resend-password") {
        return {
          ok: true,
          status: 201,
          json: async () => ({ user: member, generatedPassword: "Fr3shPassw0rd!" }),
        } as Response
      }
      throw new Error(`Unhandled fetch in test: ${method} ${url}`)
    }) as jest.Mock
  })

  // UpdateKioskUserDto had no `email` field at all, so email was unchangeable by anyone.
  it("saves a changed name, email, and location assignment together", async () => {
    const user = userEvent.setup()
    renderWithClient(<EditTeamMemberPage />)

    const email = await screen.findByLabelText("Email")
    await user.clear(email)
    await user.type(email, "renamed@example.com")
    await user.click(await screen.findByRole("checkbox", { name: /Downtown/ }))
    await user.click(screen.getByRole("button", { name: /save changes/i }))

    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/proxy/kiosks/kiosk-1/users/user-2",
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({
            name: "Max Manager",
            email: "renamed@example.com",
            managedLocationIds: ["loc-1"],
          }),
        }),
      ),
    )
  })

  // "I don't get their first-time password" had no recovery path: the old one was unreadable
  // and a new one could not be minted.
  it("issues a fresh password and shows it", async () => {
    const user = userEvent.setup()
    renderWithClient(<EditTeamMemberPage />)

    await user.click(await screen.findByRole("button", { name: /issue a new password/i }))

    expect(await screen.findByText("Fr3shPassw0rd!")).toBeInTheDocument()
  })

  it("flags a member who has never signed in", async () => {
    renderWithClient(<EditTeamMemberPage />)

    expect(await screen.findByText("Has not signed in yet")).toBeInTheDocument()
  })

  it("removes the member and returns to settings", async () => {
    const user = userEvent.setup()
    renderWithClient(<EditTeamMemberPage />)

    await user.click(await screen.findByRole("button", { name: /delete max manager/i }))
    await user.click(await screen.findByRole("button", { name: "Delete" }))

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith("/portal/settings"))
  })
})
