import { render, screen } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import AffiliateProgramsPage from "./page"
import type { AffiliateProgram } from "@/lib/api/types"

const programs: AffiliateProgram[] = [
  {
    id: "p-1",
    networkName: "Impact",
    programId: "12345",
    hasCouponApi: true,
    hasCredentials: true,
    createdAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "p-2",
    networkName: "Direct link",
    programId: null,
    hasCouponApi: false,
    hasCredentials: false,
    createdAt: "2026-01-02T00:00:00.000Z",
  },
]

function renderWithClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>)
}

describe("AffiliateProgramsPage", () => {
  beforeEach(() => {
    global.fetch = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      const method = init?.method ?? "GET"

      if (url === "/api/proxy/affiliate-programs" && method === "GET") {
        return { ok: true, status: 200, json: async () => programs } as Response
      }
      if (url === "/api/proxy/affiliate-programs" && method === "POST") {
        const body = JSON.parse(String(init?.body))
        return {
          ok: true,
          status: 201,
          json: async () => ({ id: "p-3", hasCredentials: !!body.apiCredentials, createdAt: "now", ...body }),
        } as Response
      }

      throw new Error(`Unhandled fetch in test: ${method} ${url}`)
    }) as jest.Mock
  })

  it("shows each program's coupon-API and credentials status", async () => {
    renderWithClient(<AffiliateProgramsPage />)

    expect(await screen.findByText("Impact")).toBeInTheDocument()
    expect(screen.getByText("Direct link")).toBeInTheDocument()
    expect(screen.getByText("Configured")).toBeInTheDocument()
    expect(screen.getByText("None")).toBeInTheDocument()
  })

  it("links New Program and each row's edit action to their own pages", async () => {
    renderWithClient(<AffiliateProgramsPage />)

    await screen.findByText("Impact")
    // Creating and editing a program are now pages of their own
    // (affiliate-programs/new/page.spec.tsx exercises the actual form).
    expect(screen.getByRole("link", { name: /new program/i })).toHaveAttribute(
      "href",
      "/admin/affiliate-programs/new",
    )
    expect(screen.getByRole("link", { name: /edit impact/i })).toHaveAttribute(
      "href",
      "/admin/affiliate-programs/p-1",
    )
  })
})
