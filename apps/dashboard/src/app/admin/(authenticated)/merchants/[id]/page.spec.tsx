import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import MerchantDetailPage from "./page"
import type { Coupon, Merchant, ScrapeSource } from "@/lib/api/types"

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

const mockPush = jest.fn()
jest.mock("next/navigation", () => ({
  useParams: () => ({ id: "m-1" }),
  useRouter: () => ({ push: mockPush }),
}))

const merchant: Merchant = {
  id: "m-1",
  name: "Amazon",
  domain: "amazon.com",
  attributionMethod: "COOKIE",
  affiliateTrackingUrl: "https://amazon.com/?ref=saverlly",
  affiliateUrlParamKey: null,
  affiliateUrlParamValue: null,
  affiliateProgramId: null,
  active: true,
  checkoutRecipe: {
    couponFieldSelector: "input[name='promoCode']",
    cartTotalSelector: ".total",
    checkoutUrlPatterns: ["/checkout"],
  },
  createdAt: "2026-01-01T00:00:00.000Z",
}

const coupons: Coupon[] = [
  {
    id: "c-1",
    merchantId: "m-1",
    code: "SAVE10",
    description: null,
    source: "MANUAL",
    discountType: "PERCENT",
    discountValue: 10,
    successCount: 5,
    failCount: 1,
    lastTestedAt: null,
    expiresAt: null,
    active: true,
    createdAt: "2026-01-01T00:00:00.000Z",
  },
]

const scrapeSources: ScrapeSource[] = [
  {
    id: "s-1",
    url: "https://amazon.com/coupons",
    merchantId: "m-1",
    selectorConfig: { codeSelector: ".coupon-code" },
    intervalMinutes: 1440,
    lastRunAt: null,
    active: true,
  },
]

let setupSession: Record<string, unknown> | null = null

function renderWithClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>)
}

describe("MerchantDetailPage", () => {
  beforeEach(() => {
    mockPush.mockClear()
    setupSession = null
    global.fetch = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      const method = init?.method ?? "GET"

      if (url === "/api/proxy/merchants/m-1" && method === "GET") {
        return {
          ok: true,
          status: 200,
          json: async () => merchant,
        } as Response
      }
      if (url === "/api/proxy/merchants/m-1" && method === "PATCH") {
        const body = JSON.parse(String(init?.body))
        return {
          ok: true,
          status: 200,
          json: async () => ({ ...merchant, ...body }),
        } as Response
      }
      if (url === "/api/proxy/merchants/m-1" && method === "DELETE") {
        return {
          ok: true,
          status: 204,
          json: async () => undefined,
        } as Response
      }
      if (url === "/api/proxy/merchants/m-1/setup-sessions/current" && method === "GET") {
        return { ok: true, status: 200, json: async () => ({ session: setupSession }) } as Response
      }
      if (url === "/api/proxy/merchants/m-1/setup-sessions/s-1/apply" && method === "POST") {
        const saved = { ...merchant, checkoutRecipe: { ...merchant.checkoutRecipe, couponFieldSelector: "#promo-from-setup" } }
        setupSession = { ...setupSession, state: "APPLIED", extensionActive: false, appliedAt: new Date().toISOString() }
        return { ok: true, status: 200, json: async () => ({ session: setupSession, merchant: saved }) } as Response
      }
      if (url.startsWith("/api/proxy/coupons") && method === "GET") {
        return {
          ok: true,
          status: 200,
          json: async () => coupons,
        } as Response
      }
      if (url === "/api/proxy/scrape-sources" && method === "GET") {
        return {
          ok: true,
          status: 200,
          json: async () => scrapeSources,
        } as Response
      }

      throw new Error(`Unhandled fetch in test: ${method} ${url}`)
    }) as jest.Mock
  })

  it("shows the merchant's edit form, checkout recipe, coupons, and scrape sources", async () => {
    renderWithClient(<MerchantDetailPage />)

    expect(await screen.findByDisplayValue("Amazon")).toBeInTheDocument()
    expect(screen.getByDisplayValue("input[name='promoCode']")).toBeInTheDocument()
    expect(await screen.findByText("SAVE10")).toBeInTheDocument()
    expect(await screen.findByText("https://amazon.com/coupons")).toBeInTheDocument()
  })

  it("saves the checkout recipe form", async () => {
    const user = userEvent.setup()
    renderWithClient(<MerchantDetailPage />)

    const applyButtonInput = await screen.findByLabelText("Apply button selector")
    await user.type(applyButtonInput, "button.apply")

    const saveButtons = screen.getAllByRole("button", { name: /save/i })
    const recipeSaveButton = saveButtons.find((b) => b.textContent?.includes("Save recipe"))!
    await user.click(recipeSaveButton)

    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/proxy/merchants/m-1",
        expect.objectContaining({ method: "PATCH" }),
      ),
    )
  })

  it("offers extension setup, and the recipe form shows a recipe saved from it", async () => {
    const user = userEvent.setup()
    setupSession = {
      id: "s-1",
      merchantId: "m-1",
      state: "SUBMITTED",
      extensionActive: false,
      codeExpiresAt: new Date().toISOString(),
      sessionExpiresAt: new Date().toISOString(),
      connectedAt: null,
      lastSeenAt: null,
      submittedAt: new Date().toISOString(),
      appliedAt: null,
      cancelledAt: null,
      createdAt: new Date().toISOString(),
      createdById: "u-1",
      appliedById: null,
      draftRecipe: { couponFieldSelector: "#promo-from-setup", applyButtonSelector: "button", cartTotalSelector: ".total", checkoutUrlPatterns: ["/checkout"] },
      testResult: { passed: true, checks: [{ key: "promoField", outcome: "pass" }], testedAt: new Date().toISOString() },
    }
    renderWithClient(<MerchantDetailPage />)

    expect(await screen.findByText("Set up with extension")).toBeInTheDocument()
    expect(screen.getByDisplayValue("input[name='promoCode']")).toBeInTheDocument()
    expect(await screen.findByText("Ready to save")).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "Save recipe to store" }))

    expect(await screen.findByDisplayValue("#promo-from-setup")).toBeInTheDocument()
    expect(screen.queryByDisplayValue("input[name='promoCode']")).not.toBeInTheDocument()
  })

  it("deletes the merchant and redirects to the list", async () => {
    const user = userEvent.setup()
    renderWithClient(<MerchantDetailPage />)

    const deleteButton = await screen.findByRole("button", { name: /delete/i })
    await user.click(deleteButton)
    const confirmButton = await screen.findByRole("button", { name: "Delete" })
    await user.click(confirmButton)

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith("/admin/merchants"))
  })
})
