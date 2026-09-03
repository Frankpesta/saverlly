import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import NewMerchantPage from "./page"

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
  useRouter: () => ({ push: mockPush }),
}))

function renderWithClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>)
}

describe("NewMerchantPage", () => {
  beforeEach(() => {
    mockPush.mockClear()
    global.fetch = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      const method = init?.method ?? "GET"
      if (url === "/api/proxy/affiliate-programs" && method === "GET") {
        return { ok: true, status: 200, json: async () => [] } as Response
      }
      if (url === "/api/proxy/merchants" && method === "POST") {
        return {
          ok: true,
          status: 201,
          json: async () => ({ id: "merchant-9", name: "Target", domain: "target.com" }),
        } as Response
      }
      throw new Error(`Unhandled fetch in test: ${method} ${url}`)
    }) as jest.Mock
  })

  it("shows every section at once rather than as wizard steps", () => {
    renderWithClient(<NewMerchantPage />)

    expect(screen.getByLabelText("Name")).toBeInTheDocument()
    expect(screen.getByLabelText("Domain")).toBeInTheDocument()
    // "Tracking method" is both this section's label and a field label inside
    // AttributionFields, so match the uppercase section eyebrow specifically.
    expect(screen.getByText("Tracking method", { selector: "span" })).toBeInTheDocument()
    expect(screen.getByText("Coupon sourcing", { selector: "span" })).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: /continue/i })).not.toBeInTheDocument()
  })

  it("creates the store and routes to its detail page", async () => {
    const user = userEvent.setup()
    renderWithClient(<NewMerchantPage />)

    await user.type(screen.getByLabelText("Name"), "Target")
    await user.type(screen.getByLabelText("Domain"), "target.com")
    await user.type(
      screen.getByLabelText("Affiliate tracking URL"),
      "https://track.target.com",
    )
    await user.click(screen.getByRole("button", { name: /add store/i }))

    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/proxy/merchants",
        expect.objectContaining({ method: "POST" }),
      ),
    )
    expect(mockPush).toHaveBeenCalledWith("/admin/merchants/merchant-9")
  }, 15000)

  it("explains what a coupon code selector is, inline", async () => {
    const user = userEvent.setup()
    renderWithClient(<NewMerchantPage />)

    // The selector fields only appear once you opt into adding a scrape source.
    await user.click(screen.getByLabelText("Add a scrape source now"))
    await user.click(screen.getByRole("button", { name: /how do i find this/i }))

    expect(await screen.findByText("This is a CSS selector")).toBeInTheDocument()
  })
})
