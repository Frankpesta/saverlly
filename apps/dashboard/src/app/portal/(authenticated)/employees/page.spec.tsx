import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import EmployeesPage from "./page"
import type { Location, LocationEmployeeWithLocation } from "@/lib/api/types"

const downtown: Location = {
  id: "loc-1",
  kioskId: "kiosk-1",
  name: "Downtown",
  address: "1 Main St",
  city: "Springfield",
  state: "IL",
  zip: "00000",
  latitude: null,
  longitude: null,
  tags: [],
  locationSetupCode: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
}

const uptown: Location = { ...downtown, id: "loc-2", name: "Uptown" }

const employee: LocationEmployeeWithLocation = {
  id: "emp-1",
  locationId: "loc-1",
  name: "Alex Employee",
  title: "Cashier",
  phone: "555-0101",
  email: "alex@example.com",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  location: { id: "loc-1", name: "Downtown" },
}

function renderWithClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>)
}

describe("EmployeesPage", () => {
  beforeEach(() => {
    global.fetch = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      const method = init?.method ?? "GET"

      if (url === "/api/proxy/my/employees" && method === "GET") {
        return { ok: true, status: 200, json: async () => [employee] } as Response
      }
      if (url === "/api/proxy/locations" && method === "GET") {
        return { ok: true, status: 200, json: async () => [downtown, uptown] } as Response
      }
      if (url === "/api/proxy/locations/loc-2/employees" && method === "POST") {
        return {
          ok: true,
          status: 201,
          json: async () => ({
            id: "emp-2",
            locationId: "loc-2",
            name: "New Person",
            title: null,
            phone: null,
            email: null,
            createdAt: "2026-01-04T00:00:00.000Z",
            updatedAt: "2026-01-04T00:00:00.000Z",
          }),
        } as Response
      }
      if (url === "/api/proxy/locations/loc-1/employees/emp-1" && method === "PATCH") {
        return { ok: true, status: 200, json: async () => ({ ...employee, name: "Alexandra Employee" }) } as Response
      }
      if (url === "/api/proxy/locations/loc-1/employees/emp-1" && method === "DELETE") {
        return { ok: true, status: 204, json: async () => undefined } as Response
      }
      throw new Error(`Unhandled fetch in test: ${method} ${url}`)
    }) as jest.Mock
  })

  it("lists the roster across every location, naming which location each employee is at", async () => {
    renderWithClient(<EmployeesPage />)

    expect(await screen.findByText("Alex Employee")).toBeInTheDocument()
    expect(screen.getByText("Downtown")).toBeInTheDocument()
    expect(screen.getByText("Cashier")).toBeInTheDocument()
  })

  it("adds an employee at a chosen location", async () => {
    const user = userEvent.setup()
    renderWithClient(<EmployeesPage />)

    await user.click(await screen.findByRole("button", { name: /^add employee$/i }))
    const dialog = await screen.findByRole("dialog", { name: /add employee/i })
    await user.click(within(dialog).getByRole("combobox", { name: "Location" }))
    await user.click(await screen.findByRole("option", { name: "Uptown" }))
    await user.type(within(dialog).getByLabelText("Name"), "New Person")
    await user.click(within(dialog).getByRole("button", { name: /^add employee$/i }))

    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/proxy/locations/loc-2/employees",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ name: "New Person" }),
        }),
      ),
    )
  })

  it("edits an employee without a location field (it isn't reassignable here)", async () => {
    const user = userEvent.setup()
    renderWithClient(<EmployeesPage />)

    await user.click(await screen.findByRole("button", { name: "Edit Alex Employee" }))
    const dialog = await screen.findByRole("dialog", { name: /edit employee/i })
    expect(within(dialog).queryByRole("combobox", { name: "Location" })).not.toBeInTheDocument()
    const nameInput = within(dialog).getByLabelText("Name")
    await user.clear(nameInput)
    await user.type(nameInput, "Alexandra Employee")
    await user.click(within(dialog).getByRole("button", { name: /^save changes$/i }))

    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/proxy/locations/loc-1/employees/emp-1",
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({
            name: "Alexandra Employee",
            title: "Cashier",
            phone: "555-0101",
            email: "alex@example.com",
          }),
        }),
      ),
    )
  })

  it("removes an employee", async () => {
    const user = userEvent.setup()
    renderWithClient(<EmployeesPage />)

    await user.click(await screen.findByRole("button", { name: "Remove Alex Employee" }))
    await user.click(await screen.findByRole("button", { name: "Delete" }))

    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/proxy/locations/loc-1/employees/emp-1",
        expect.objectContaining({ method: "DELETE" }),
      ),
    )
  })

  it("filters the roster by location", async () => {
    const user = userEvent.setup()
    renderWithClient(<EmployeesPage />)

    await screen.findByText("Alex Employee")
    await user.click(screen.getByRole("combobox", { name: "Filter Employees by Location" }))
    await user.click(await screen.findByRole("option", { name: "Uptown" }))

    expect(screen.queryByText("Alex Employee")).not.toBeInTheDocument()
  })
})
