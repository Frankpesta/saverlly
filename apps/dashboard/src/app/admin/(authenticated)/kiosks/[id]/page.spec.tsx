import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import KioskDetailPage from "./page"
import type { Kiosk, KioskUser } from "@/lib/api/types"

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
  useRouter: () => ({ push: jest.fn() }),
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

const kioskUsers: KioskUser[] = [
  {
    id: "user-1",
    name: "Owner One",
    avatarUrl: null,
    email: "owner1@example.com",
    role: "KIOSK_OWNER",
    kioskId: "kiosk-1",
    disabled: false,
    managedLocationIds: [],
    mustChangePassword: false,
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

describe("KioskDetailPage", () => {
  beforeEach(() => {
    global.fetch = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      const method = init?.method ?? "GET"

      if (url === "/api/proxy/kiosks/kiosk-1" && method === "GET") {
        return { ok: true, status: 200, json: async () => kiosk } as Response
      }
      if (url === "/api/proxy/kiosks/kiosk-1/users" && method === "GET") {
        return { ok: true, status: 200, json: async () => kioskUsers } as Response
      }
      if (url === "/api/proxy/kiosks/kiosk-1/users" && method === "POST") {
        return {
          ok: true,
          status: 201,
          json: async () => ({
            user: {
              ...kioskUsers[0],
              id: "user-2",
              name: "New Manager",
              avatarUrl: null,
              email: "manager@example.com",
              role: "LOCATION_MANAGER",
            },
            generatedPassword: "Gen3ratedPassw0rd!",
          }),
        } as Response
      }
      if (url === "/api/proxy/kiosks/kiosk-1/users/user-1" && method === "PATCH") {
        return {
          ok: true,
          status: 200,
          json: async () => ({ ...kioskUsers[0], disabled: true }),
        } as Response
      }

      throw new Error(`Unhandled fetch in test: ${method} ${url}`)
    }) as jest.Mock
  })

  it("renders the kiosk's fields and its existing users", async () => {
    renderWithClient(<KioskDetailPage />)

    expect(await screen.findByDisplayValue("Kiosk One")).toBeInTheDocument()
    expect(screen.getByDisplayValue("30")).toBeInTheDocument()
    expect(await screen.findByText("owner1@example.com")).toBeInTheDocument()
    // Owner vs manager is now a group heading + distinct avatar treatment, not a per-row role
    // badge, so the assertion is on the group rather than badge text that no longer renders.
    expect(screen.getByText("Owner")).toBeInTheDocument()
  })

  it("disables a kiosk user via the access switch", async () => {
    renderWithClient(<KioskDetailPage />)

    const toggle = await screen.findByRole("switch", {
      name: "Toggle owner1@example.com access",
    })
    expect(toggle).toBeChecked()

    await userEvent.click(toggle)

    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/proxy/kiosks/kiosk-1/users/user-1",
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({ disabled: true }),
        }),
      ),
    )
  })

  it("links Add user to the dedicated create page rather than opening a modal", async () => {
    renderWithClient(<KioskDetailPage />)

    await screen.findByText("owner1@example.com")
    // Adding a kiosk user is now a page of its own
    // (kiosks/[id]/users/new/page.spec.tsx exercises the actual form).
    expect(screen.getByRole("link", { name: /add user/i })).toHaveAttribute(
      "href",
      "/admin/kiosks/kiosk-1/users/new",
    )
  })

  it("links each user's edit action to their own edit page", async () => {
    renderWithClient(<KioskDetailPage />)

    expect(await screen.findByRole("link", { name: /edit owner1@example.com/i })).toHaveAttribute(
      "href",
      "/admin/kiosks/kiosk-1/users/user-1",
    )
  })
})
