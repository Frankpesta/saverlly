import { render, screen } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import AdminSettingsPage from "./page"
import type { UserProfile } from "@/lib/api/types"

const admin: UserProfile = {
  id: "user-1",
  email: "admin@example.com",
  role: "ADMIN",
  kioskId: null,
}

function renderWithClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>)
}

describe("AdminSettingsPage", () => {
  beforeEach(() => {
    global.fetch = jest.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url === "/api/proxy/users/me") return { ok: true, status: 200, json: async () => admin } as Response
      throw new Error(`Unhandled fetch in test: ${url}`)
    }) as jest.Mock
  })

  it("shows account info and the self-service change-password card", async () => {
    renderWithClient(<AdminSettingsPage />)

    expect(await screen.findByText("admin@example.com")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /update password/i })).toBeInTheDocument()
  })
})
