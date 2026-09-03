import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import AdminSettingsPage from "./page"
import type { UserProfile } from "@/lib/api/types"

const admin: UserProfile = {
  id: "user-1",
  name: "Admin User",
  email: "admin@example.com",
  role: "ADMIN",
  kioskId: null,
}

const admins = [
  {
    id: "user-1",
    name: "Admin User",
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
      if (url === "/api/proxy/users/me" && method === "PATCH") {
        return {
          ok: true,
          status: 200,
          json: async () => ({ ...admin, name: "Updated Admin", email: "updated@example.com" }),
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

  it("shows account info and the self-service change-password card", async () => {
    renderWithClient(<AdminSettingsPage />)

    const accountSection = (await screen.findByText("Account")).closest("section")!
    expect(await within(accountSection).findByText("admin@example.com")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /update password/i })).toBeInTheDocument()
  })

  it("edits the account name and email via PATCH /users/me", async () => {
    const user = userEvent.setup()
    renderWithClient(<AdminSettingsPage />)

    const accountSection = (await screen.findByText("Account")).closest("section")!
    await within(accountSection).findByText("admin@example.com")
    await user.click(screen.getByRole("button", { name: "Edit account" }))

    const nameInput = screen.getByPlaceholderText("Name")
    await user.clear(nameInput)
    await user.type(nameInput, "Updated Admin")
    await user.click(screen.getByRole("button", { name: "Save" }))

    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/proxy/users/me",
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({ name: "Updated Admin", email: "admin@example.com" }),
        }),
      ),
    )

    expect(await screen.findByText("Updated Admin")).toBeInTheDocument()
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
