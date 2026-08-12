import { render, screen, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import AdminOverviewPage from "./page"
import type { Kiosk } from "@/lib/api/types"

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

const kiosks: Kiosk[] = [
  {
    id: "kiosk-1",
    name: "Kiosk One",
    status: "ACTIVE",
    revenueSharePct: "30",
    contactEmail: "owner1@example.com",
    stripeAccountId: null,
    stripePayoutsEnabled: false,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-05T00:00:00.000Z",
  },
  {
    id: "kiosk-2",
    name: "Kiosk Two",
    status: "INACTIVE",
    revenueSharePct: "25.5",
    contactEmail: "owner2@example.com",
    stripeAccountId: null,
    stripePayoutsEnabled: false,
    createdAt: "2026-01-02T00:00:00.000Z",
    updatedAt: "2026-01-02T00:00:00.000Z",
  },
]

function renderWithClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>)
}

describe("AdminOverviewPage", () => {
  beforeEach(() => {
    global.fetch = jest.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url === "/api/proxy/kiosks") {
        return { ok: true, status: 200, json: async () => kiosks } as Response
      }
      throw new Error(`Unhandled fetch in test: ${url}`)
    }) as jest.Mock
  })

  it("computes stat tiles from real kiosk data", async () => {
    renderWithClient(<AdminOverviewPage />)

    await waitFor(() => expect(screen.getByText("2")).toBeInTheDocument(), { timeout: 2000 })
    await waitFor(() => expect(screen.getByText("27.8%")).toBeInTheDocument(), { timeout: 2000 })
    expect(screen.getByText("1 of 2 kiosks active")).toBeInTheDocument()
  })

  it("lists the most recently updated kiosk first in recent activity, with created/updated labeling", async () => {
    renderWithClient(<AdminOverviewPage />)

    const activityLink = await screen.findByRole("link", { name: /Kiosk One/ })
    expect(activityLink).toHaveTextContent("was updated")
    expect(activityLink).toHaveAttribute("href", "/admin/kiosks/kiosk-1")

    const createdLink = screen.getByRole("link", { name: /Kiosk Two/ })
    expect(createdLink).toHaveTextContent("was created")
  })

  it("shows coming-soon slots for unbuilt sections", async () => {
    renderWithClient(<AdminOverviewPage />)

    await screen.findByText("Kiosk One")
    expect(screen.getByText("Merchants")).toBeInTheDocument()
    expect(screen.getByText("Coupons")).toBeInTheDocument()
    expect(screen.getByText("Affiliate programs")).toBeInTheDocument()
  })
})
