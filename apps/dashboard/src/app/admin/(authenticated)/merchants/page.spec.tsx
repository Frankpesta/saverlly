import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import MerchantsPage from "./page"
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
    affiliateProgramId: "p-1",
    active: true,
    checkoutRecipe: null,
    createdAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "m-2",
    name: "Jumia",
    domain: "jumia.com",
    attributionMethod: "URL_PARAM",
    affiliateTrackingUrl: null,
    affiliateUrlParamKey: "irclickid",
    affiliateUrlParamValue: "saverlly-123",
    affiliateProgramId: null,
    active: false,
    checkoutRecipe: null,
    createdAt: "2026-01-02T00:00:00.000Z",
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
    successCount: 5,
    failCount: 1,
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

describe("MerchantsPage", () => {
  beforeEach(() => {
    global.fetch = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      const method = init?.method ?? "GET"

      if (url === "/api/proxy/merchants" && method === "GET") {
        return { ok: true, status: 200, json: async () => merchants } as Response
      }
      if (url.startsWith("/api/proxy/coupons") && method === "GET") {
        return { ok: true, status: 200, json: async () => coupons } as Response
      }
      if (url === "/api/proxy/merchants/m-2" && method === "PATCH") {
        return { ok: true, status: 200, json: async () => ({ ...merchants[1], active: true }) } as Response
      }

      throw new Error(`Unhandled fetch in test: ${method} ${url}`)
    }) as jest.Mock
  })

  it("computes stat tiles and renders each merchant's tracking method and coupon count", async () => {
    renderWithClient(<MerchantsPage />)

    const amazonLink = await screen.findByText("Amazon")
    expect(screen.getByText("Jumia")).toBeInTheDocument()
    expect(screen.getByText("Cookie")).toBeInTheDocument()
    expect(screen.getByText("URL param")).toBeInTheDocument()

    const amazonRow = amazonLink.closest("tr") as HTMLElement
    await waitFor(() => expect(within(amazonRow).getByText("1")).toBeInTheDocument()) // coupon count
  })

  it("toggles a merchant's active state", async () => {
    const user = userEvent.setup()
    renderWithClient(<MerchantsPage />)

    await screen.findByText("Jumia")
    const toggles = screen.getAllByRole("switch")
    await user.click(toggles[1]) // Jumia's row

    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/proxy/merchants/m-2",
        expect.objectContaining({ method: "PATCH" }),
      ),
    )
  })
})
