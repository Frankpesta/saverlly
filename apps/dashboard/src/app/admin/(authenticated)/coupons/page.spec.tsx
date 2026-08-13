import { render, screen, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import CouponsPage from "./page"
import type { Coupon, Merchant } from "@/lib/api/types"

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

const merchants: Merchant[] = [
  {
    id: "m-1",
    name: "Amazon",
    domain: "amazon.com",
    attributionMethod: "COOKIE",
    affiliateTrackingUrl: "https://amazon.com/?ref=saverlly",
    affiliateUrlParamKey: null,
    affiliateUrlParamValue: null,
    affiliateProgramId: null,
    active: true,
    checkoutRecipe: null,
    createdAt: "2026-01-01T00:00:00.000Z",
  },
]

const coupons: Coupon[] = [
  {
    id: "c-1",
    merchantId: "m-1",
    code: "SAVE10",
    description: null,
    source: "MANUAL",
    discountType: "percent",
    discountValue: 10,
    successCount: 8,
    failCount: 2,
    lastTestedAt: null,
    expiresAt: null,
    active: true,
    createdAt: "2026-01-01T00:00:00.000Z",
  },
]

function renderWithClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>)
}

describe("CouponsPage", () => {
  beforeEach(() => {
    global.fetch = jest.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url === "/api/proxy/merchants") {
        return { ok: true, status: 200, json: async () => merchants } as Response
      }
      if (url.startsWith("/api/proxy/coupons")) {
        return { ok: true, status: 200, json: async () => coupons } as Response
      }
      throw new Error(`Unhandled fetch in test: ${url}`)
    }) as jest.Mock
  })

  it("resolves merchant names and computes the platform success rate", async () => {
    renderWithClient(<CouponsPage />)

    expect(await screen.findByText("Amazon")).toBeInTheDocument()
    expect(screen.getByText("SAVE10")).toBeInTheDocument()
    // 8 success / 10 attempts = 80%
    await waitFor(() => expect(screen.getByText("80.0%")).toBeInTheDocument())
  })
})
