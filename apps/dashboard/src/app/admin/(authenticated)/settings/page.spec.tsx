import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import AdminSettingsPage from "./page"
import type { UserProfile } from "@/lib/api/types"

const admin: UserProfile = {
  id: "user-1",
  name: "Admin User",
  avatarUrl: null,
  email: "admin@example.com",
  role: "ADMIN",
  kioskId: null,
}

const admins = [
  {
    id: "user-1",
    name: "Admin User",
    avatarUrl: null,
    email: "admin@example.com",
    role: "ADMIN" as const,
    kioskId: null,
    disabled: false,
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

describe("AdminSettingsPage", () => {
  beforeEach(() => {
    global.fetch = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      const method = init?.method ?? "GET"
      if (url === "/api/proxy/users/me" && method === "GET") {
        return { ok: true, status: 200, json: async () => admin } as Response
      }
      if (url === "/api/proxy/settings" && method === "GET") {
        return {
          ok: true,
          status: 200,
          json: async () => ({ supportEmail: "support@saverlly.com" }),
        } as Response
      }
      if (url === "/api/proxy/settings" && method === "PATCH") {
        return {
          ok: true,
          status: 200,
          json: async () => ({ supportEmail: "help@saverlly.com" }),
        } as Response
      }
      if (url === "/api/proxy/users/admins" && method === "GET") {
        return { ok: true, status: 200, json: async () => admins } as Response
      }
      if (url === "/api/proxy/users/admins" && method === "POST") {
        return {
          ok: true,
          status: 201,
          json: async () => ({
            user: {
              id: "user-2",
              name: "New Teammate",
              avatarUrl: null,
              email: "teammate@example.com",
              role: "ADMIN",
              kioskId: null,
              disabled: false,
              mustChangePassword: true,
              createdAt: "2026-01-02T00:00:00.000Z",
              updatedAt: "2026-01-02T00:00:00.000Z",
            },
            generatedPassword: "Generated-Password-1",
          }),
        } as Response
      }
      throw new Error(`Unhandled fetch in test: ${method} ${url}`)
    }) as jest.Mock
  })

  it("shows the self-service change-password card", async () => {
    renderWithClient(<AdminSettingsPage />)

    expect(await screen.findByRole("button", { name: /update password/i })).toBeInTheDocument()
  })

  // Identity (name, email, photo, role) moved to /admin/profile, so Settings is employees,
  // platform config, and password only.
  it("no longer carries the account section", async () => {
    renderWithClient(<AdminSettingsPage />)

    await screen.findByText(/\(you\)/)
    expect(screen.queryByText("Account")).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Edit account" })).not.toBeInTheDocument()
  })

  // The support address used to be a build-time NEXT_PUBLIC_ var, so changing it meant a
  // frontend redeploy. The client asked to change it from the backend.
  it("saves the support email to the backend", async () => {
    const user = userEvent.setup()
    renderWithClient(<AdminSettingsPage />)

    const input = await screen.findByLabelText("Support email")
    expect(input).toHaveValue("support@saverlly.com")

    await user.clear(input)
    await user.type(input, "help@saverlly.com")
    await user.click(screen.getByRole("button", { name: "Save" }))

    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/proxy/settings",
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({ supportEmail: "help@saverlly.com" }),
        }),
      ),
    )
  })

  it("accepts an empty support email, which unlinks the portal copy", async () => {
    const user = userEvent.setup()
    renderWithClient(<AdminSettingsPage />)

    await user.clear(await screen.findByLabelText("Support email"))
    await user.click(screen.getByRole("button", { name: "Save" }))

    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/proxy/settings",
        expect.objectContaining({ body: JSON.stringify({ supportEmail: "" }) }),
      ),
    )
  })

  it("lists existing employees and links Add employee to its own page", async () => {
    renderWithClient(<AdminSettingsPage />)

    expect(await screen.findByText(/\(you\)/)).toBeInTheDocument()
    // Adding an employee is now a page of its own
    // (settings/employees/new/page.spec.tsx exercises the actual form).
    expect(screen.getByRole("link", { name: /add employee/i })).toHaveAttribute(
      "href",
      "/admin/settings/employees/new",
    )
  })
})
