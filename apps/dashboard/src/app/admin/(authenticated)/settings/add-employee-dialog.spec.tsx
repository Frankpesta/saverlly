import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { AddEmployeeDialog } from "./add-employee-dialog"

function renderWithClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>)
}

describe("AddEmployeeDialog", () => {
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

  it("adds an employee in the dialog and reveals the generated password", async () => {
    const user = userEvent.setup()
    renderWithClient(<AddEmployeeDialog />)

    await user.click(screen.getByRole("button", { name: /^add employee$/i }))
    const dialog = await screen.findByRole("dialog", { name: /add employee/i })
    await user.type(within(dialog).getByLabelText("Name"), "New Teammate")
    await user.type(within(dialog).getByLabelText("Email"), "teammate@example.com")
    await user.click(within(dialog).getByRole("button", { name: /^add employee$/i }))

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
    expect(screen.getByRole("button", { name: /^done$/i })).toBeInTheDocument()
  })
})
