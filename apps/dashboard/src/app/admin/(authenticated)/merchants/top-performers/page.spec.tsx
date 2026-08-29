import { render, screen } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import TopPerformingMerchantsPage from "./page"
import type { CommissionEvent, Coupon, Merchant } from "@/lib/api/types"

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
    id: "merchant-1",
    name: "Low Merchant",
    domain: "low.example.com",
    attributionMethod: "URL_PARAM",
    affiliateTrackingUrl: null,
    affiliateUrlParamKey: null,
    affiliateUrlParamValue: null,
    affiliateProgramId: null,
    active: true,
    checkoutRecipe: null,
    createdAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "merchant-2",
    name: "Top Merchant",
    domain: "top.example.com",
    attributionMethod: "URL_PARAM",
    affiliateTrackingUrl: null,
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
    id: "coupon-1",
    merchantId: "merchant-2",
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
  } as Coupon,
]

const events: CommissionEvent[] = [
  {
    id: "event-1",
    deviceId: "device-1",
    merchantId: "merchant-1",
    couponId: null,
    networkReference: "ref-1",
    orderValue: 100,
    commissionAmount: 10,
    kioskShareAmount: 3,
    status: "CONFIRMED",
    reportedAt: "2026-01-01T00:00:00.000Z",
    confirmedAt: "2026-01-01T00:00:00.000Z",
  } as CommissionEvent,
  {
    id: "event-2",
    deviceId: "device-2",
    merchantId: "merchant-2",
    couponId: null,
    networkReference: "ref-2",
    orderValue: 1000,
    commissionAmount: 100,
    kioskShareAmount: 30,
    status: "CONFIRMED",
    reportedAt: "2026-01-01T00:00:00.000Z",
    confirmedAt: "2026-01-01T00:00:00.000Z",
  } as CommissionEvent,
]

function renderWithClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>)
}

describe("TopPerformingMerchantsPage", () => {
  beforeEach(() => {
    global.fetch = jest.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url === "/api/proxy/merchants") return { ok: true, status: 200, json: async () => merchants } as Response
      if (url.startsWith("/api/proxy/coupons")) return { ok: true, status: 200, json: async () => coupons } as Response
      if (url === "/api/proxy/commission-events") return { ok: true, status: 200, json: async () => events } as Response
      throw new Error(`Unhandled fetch in test: ${url}`)
    }) as jest.Mock
  })

  it("ranks merchants by confirmed commission, highest first, with coupon success rate", async () => {
    renderWithClient(<TopPerformingMerchantsPage />)

    await screen.findByText("Top Merchant")
    const rows = screen.getAllByRole("row")
    expect(rows[1]).toHaveTextContent("Top Merchant")
    expect(rows[1]).toHaveTextContent("80% coupons")
    expect(rows[1]).toHaveTextContent("$100")
    expect(rows[2]).toHaveTextContent("Low Merchant")
    expect(rows[2]).toHaveTextContent("$10")
  })
})
