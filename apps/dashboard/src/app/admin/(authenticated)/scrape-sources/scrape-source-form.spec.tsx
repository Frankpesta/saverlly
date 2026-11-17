import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { ScrapeSourceForm } from "./scrape-source-form"
import type { Merchant, ScrapeSource } from "@/lib/api/types"

const mockPush = jest.fn()
jest.mock("next/navigation", () => ({ useRouter: () => ({ push: mockPush }) }))
jest.mock("next/link", () => {
  const Link = ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  )
  return Link
})

const merchant: Merchant = {
  id: "m-1",
  name: "Allbirds",
  domain: "www.allbirds.com",
  attributionMethod: "COOKIE",
  affiliateTrackingUrl: null,
  affiliateUrlParamKey: null,
  affiliateUrlParamValue: null,
  affiliateProgramId: null,
  active: true,
  checkoutRecipe: null,
  createdAt: "2026-01-01T00:00:00.000Z",
} as Merchant

function renderForm(props: Partial<React.ComponentProps<typeof ScrapeSourceForm>>) {
  const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <ScrapeSourceForm backHref="/back" backLabel="Back" {...props} />
    </QueryClientProvider>,
  )
}

function lastBody() {
  const calls = (global.fetch as jest.Mock).mock.calls
  return JSON.parse(calls[calls.length - 1][1].body)
}

describe("ScrapeSourceForm", () => {
  beforeEach(() => {
    mockPush.mockReset()
    global.fetch = jest.fn(async () => ({
      ok: true,
      status: 201,
      json: async () => ({}),
    })) as unknown as typeof fetch
  })

  it("adds a coupon site source with no URL or selectors", async () => {
    const user = userEvent.setup()
    renderForm({ merchants: [merchant], lockedMerchantId: "m-1" })

    // Built-in sites need neither a page URL nor selectors.
    expect(screen.queryByLabelText("Page URL")).not.toBeInTheDocument()
    expect(screen.queryByLabelText("Coupon code selector")).not.toBeInTheDocument()
    expect(screen.getByText("https://simplycodes.com/store/allbirds.com")).toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: "Add scrape source" }))

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith("/back"))
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/proxy/scrape-sources",
      expect.objectContaining({ method: "POST" }),
    )
    expect(lastBody()).toEqual({
      strategy: "SIMPLYCODES",
      merchantId: "m-1",
      intervalMinutes: 1440,
    })
  })

  it("only changes the schedule when editing a coupon site source", async () => {
    const user = userEvent.setup()
    const source: ScrapeSource = {
      id: "s-1",
      url: "https://couponfollow.com/site/allbirds.com",
      merchantId: "m-1",
      strategy: "COUPONFOLLOW",
      selectorConfig: null,
      intervalMinutes: 360,
      status: "ACTIVE",
      nextRunAt: null,
      consecutiveFailures: 0,
      autoCreated: false,
      lastRunAt: null,
      active: true,
    }
    renderForm({ source, merchants: [merchant] })

    expect(screen.getByText("CouponFollow")).toBeInTheDocument()
    expect(screen.getByText(source.url)).toBeInTheDocument()
    const interval = screen.getByLabelText("Scrape every")
    expect(interval).toHaveValue("6")
    await user.clear(interval)
    await user.type(interval, "12")
    await user.click(screen.getByRole("button", { name: "Save changes" }))

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith("/back"))
    expect(lastBody()).toEqual({ intervalMinutes: 720 })
  })

  it("still needs a URL and a code selector for a custom page", async () => {
    const user = userEvent.setup()
    const source: ScrapeSource = {
      id: "s-2",
      url: "",
      merchantId: "m-1",
      strategy: "GENERIC_CSS",
      selectorConfig: { codeSelector: "" },
      intervalMinutes: 1440,
      status: "ACTIVE",
      nextRunAt: null,
      consecutiveFailures: 0,
      autoCreated: false,
      lastRunAt: null,
      active: true,
    }
    renderForm({ source, merchants: [merchant] })

    await user.click(screen.getByRole("button", { name: "Save changes" }))

    expect(await screen.findByText("Page URL is required")).toBeInTheDocument()
    expect(screen.getByText("Coupon code selector is required")).toBeInTheDocument()
    expect(global.fetch).not.toHaveBeenCalled()
  })
})
