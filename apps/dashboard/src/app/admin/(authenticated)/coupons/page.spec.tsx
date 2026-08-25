import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
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
  {
    id: "c-2",
    merchantId: "m-1",
    code: "SAVE20",
    description: null,
    source: "MANUAL",
    discountType: "percent",
    discountValue: 20,
    successCount: 1,
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

    expect(await screen.findAllByText("Amazon")).toHaveLength(2)
    expect(screen.getByText("SAVE10")).toBeInTheDocument()
    // (8 + 1) success / (8 + 2 + 1 + 1) attempts = 75%
    await waitFor(() => expect(screen.getByText("75.0%")).toBeInTheDocument())
  })

  it("shows the selection toolbar with a live count as rows are checked, and clears on Clear", async () => {
    const user = userEvent.setup()
    renderWithClient(<CouponsPage />)

    await screen.findByText("SAVE10")
    expect(screen.queryByText(/selected/)).not.toBeInTheDocument()

    const rowCheckboxes = screen.getAllByRole("checkbox", { name: /^Select SAVE/ })
    await user.click(rowCheckboxes[0])
    expect(await screen.findByText("1 selected")).toBeInTheDocument()

    await user.click(rowCheckboxes[1])
    expect(await screen.findByText("2 selected")).toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: /clear selection/i }))
    expect(screen.queryByText(/selected/)).not.toBeInTheDocument()
  })

  it("bulk-deletes every selected coupon and clears the selection afterward", async () => {
    const user = userEvent.setup()
    const deletedIds: string[] = []
    global.fetch = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url === "/api/proxy/merchants") {
        return { ok: true, status: 200, json: async () => merchants } as Response
      }
      if (init?.method === "DELETE" && url.startsWith("/api/proxy/coupons/")) {
        deletedIds.push(url.replace("/api/proxy/coupons/", ""))
        return { ok: true, status: 200, json: async () => undefined } as Response
      }
      if (url.startsWith("/api/proxy/coupons")) {
        return { ok: true, status: 200, json: async () => coupons } as Response
      }
      throw new Error(`Unhandled fetch in test: ${init?.method ?? "GET"} ${url}`)
    }) as jest.Mock

    renderWithClient(<CouponsPage />)

    await screen.findByText("SAVE10")
    const rowCheckboxes = screen.getAllByRole("checkbox", { name: /^Select SAVE/ })
    await user.click(rowCheckboxes[0])
    await user.click(rowCheckboxes[1])
    await screen.findByText("2 selected")

    await user.click(screen.getByRole("button", { name: /^Delete$/ }))
    const dialog = await screen.findByRole("alertdialog")
    await user.click(within(dialog).getByRole("button", { name: /^Delete$/ }))

    await waitFor(() => expect(deletedIds.sort()).toEqual(["c-1", "c-2"]))
    await waitFor(() => expect(screen.queryByText(/selected/)).not.toBeInTheDocument())
  })
})
