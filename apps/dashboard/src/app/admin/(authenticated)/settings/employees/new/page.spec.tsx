import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import NewAdminEmployeePage from "./page"

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

function renderWithClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>)
}

describe("NewAdminEmployeePage", () => {
  beforeEach(() => {
    global.fetch = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url === "/api/proxy/users/admins" && init?.method === "POST") {
        return {
          ok: true,
          status: 201,
          json: async () => ({
            user: {
              id: "admin-2",
              name: "New Teammate",
              email: "teammate@example.com",
              role: "ADMIN",
              kioskId: null,
              managedLocationIds: [],
              disabled: false,
              mustChangePassword: true,
              createdAt: "2026-01-01T00:00:00.000Z",
              updatedAt: "2026-01-01T00:00:00.000Z",
            },
            generatedPassword: "Generated-Password-1",
          }),
        } as Response
      }
      throw new Error(`Unhandled fetch in test: ${init?.method ?? "GET"} ${url}`)
    }) as jest.Mock
  })

  it("adds an employee and reveals the generated password as a result panel", async () => {
    const user = userEvent.setup()
    renderWithClient(<NewAdminEmployeePage />)

    await user.type(screen.getByLabelText("Name"), "New Teammate")
    await user.type(screen.getByLabelText("Email"), "teammate@example.com")
    await user.click(screen.getByRole("button", { name: /^add employee$/i }))

    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/proxy/users/admins",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ name: "New Teammate", email: "teammate@example.com" }),
        }),
      ),
    )

    expect(await screen.findByText("Generated-Password-1")).toBeInTheDocument()
    expect(screen.getByRole("link", { name: /back to settings/i })).toHaveAttribute(
      "href",
      "/admin/settings",
    )
  })
})
