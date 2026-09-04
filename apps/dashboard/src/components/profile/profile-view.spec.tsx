import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { ProfileView } from "./profile-view"
import type { Kiosk, Location, UserProfile } from "@/lib/api/types"

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
  mustChangePassword: false,
  createdAt: "2026-03-14T00:00:00.000Z",
}

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

function mockFetch(user: UserProfile = owner, supportEmail = "help@saverlly.com") {
  global.fetch = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    const method = init?.method ?? "GET"
    if (url === "/api/proxy/users/me" && method === "GET") {
      return { ok: true, status: 200, json: async () => user } as Response
    }
    if (url === "/api/proxy/users/me" && method === "PATCH") {
      return {
        ok: true,
        status: 200,
        json: async () => ({ ...user, name: "Jane Renamed" }),
      } as Response
    }
    if (url === "/api/proxy/users/me/avatar" && method === "DELETE") {
      return { ok: true, status: 200, json: async () => ({ ...user, avatarUrl: null }) } as Response
    }
    if (url === "/api/proxy/kiosks/kiosk-1") {
      return { ok: true, status: 200, json: async () => kiosk } as Response
    }
    if (url === "/api/proxy/locations") {
      return { ok: true, status: 200, json: async () => locations } as Response
    }
    if (url === "/api/proxy/settings/public") {
      return { ok: true, status: 200, json: async () => ({ supportEmail }) } as Response
    }
    throw new Error(`Unhandled fetch in test: ${method} ${url}`)
  }) as jest.Mock
}

describe("ProfileView", () => {
  it("shows the identity band, role, kiosk, and when they joined", async () => {
    mockFetch()
    renderWithClient(<ProfileView settingsHref="/portal/settings" />)

    expect(await screen.findByRole("heading", { name: "Jane Owner" })).toBeInTheDocument()
    expect(screen.getAllByText("Kiosk owner").length).toBeGreaterThan(0)
    expect(await screen.findByText("Kiosk One")).toBeInTheDocument()
    expect(screen.getByText(/On Saverlly since March 2026/)).toBeInTheDocument()
  })

  // A profile photo had nowhere to live before this page existed: the User model had no
  // avatarUrl and nav-user rendered an AvatarImage that was never populated.
  it("offers an upload control when there is no photo, and initials as the fallback", async () => {
    mockFetch()
    renderWithClient(<ProfileView settingsHref="/portal/settings" />)

    expect(
      await screen.findByRole("button", { name: /upload a profile photo/i }),
    ).toBeInTheDocument()
    expect(screen.getByText("JO")).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: /remove photo/i })).not.toBeInTheDocument()
  })

  it("offers removal once a photo is set", async () => {
    mockFetch({ ...owner, avatarUrl: "http://localhost:3000/uploads/avatars/a.png" })
    renderWithClient(<ProfileView settingsHref="/portal/settings" />)

    expect(await screen.findByRole("button", { name: /change profile photo/i })).toBeInTheDocument()
    await userEvent.click(screen.getByRole("button", { name: /remove photo/i }))

    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/proxy/users/me/avatar",
        expect.objectContaining({ method: "DELETE" }),
      ),
    )
  })

  it("saves name and email through PATCH /users/me", async () => {
    const user = userEvent.setup()
    mockFetch()
    renderWithClient(<ProfileView settingsHref="/portal/settings" />)

    const nameInput = await screen.findByLabelText("Name")
    await user.clear(nameInput)
    await user.type(nameInput, "Jane Renamed")
    await user.click(screen.getByRole("button", { name: /save changes/i }))

    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/proxy/users/me",
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({ name: "Jane Renamed", email: "owner@example.com" }),
        }),
      ),
    )
  })

  it("keeps Save disabled until something actually changes", async () => {
    mockFetch()
    renderWithClient(<ProfileView settingsHref="/portal/settings" />)

    expect(await screen.findByRole("button", { name: /save changes/i })).toBeDisabled()
  })

  // Read at runtime from the backend rather than a build-time NEXT_PUBLIC_ var.
  it("links the support address from the platform settings", async () => {
    mockFetch()
    renderWithClient(<ProfileView settingsHref="/portal/settings" />)

    expect(await screen.findByRole("link", { name: /ask your saverlly admin/i })).toHaveAttribute(
      "href",
      "mailto:help@saverlly.com",
    )
  })

  it("renders the support text unlinked when no address is configured", async () => {
    mockFetch(owner, "")
    renderWithClient(<ProfileView settingsHref="/portal/settings" />)

    await screen.findByText(/None of this is self-service/)
    expect(screen.queryByRole("link", { name: /ask your saverlly admin/i })).not.toBeInTheDocument()
  })

  it("never fetches the kiosk for a location manager, who is not allowed it", async () => {
    mockFetch({
      ...owner,
      role: "LOCATION_MANAGER",
      name: "Max Manager",
      managedLocationIds: ["loc-1"],
    })
    renderWithClient(<ProfileView settingsHref="/portal/settings" />)

    await screen.findByRole("heading", { name: "Max Manager" })
    expect(await screen.findByText("1 assigned")).toBeInTheDocument()
    expect(global.fetch).not.toHaveBeenCalledWith("/api/proxy/kiosks/kiosk-1", expect.anything())
  })

  it("points an admin at the whole platform rather than one kiosk", async () => {
    mockFetch({ ...owner, role: "ADMIN", kioskId: null, name: "Ada Admin" })
    renderWithClient(<ProfileView settingsHref="/admin/settings" />)

    expect(await screen.findByText("Every kiosk on the platform")).toBeInTheDocument()
    expect(screen.queryByText(/None of this is self-service/)).not.toBeInTheDocument()
  })
})
