import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import NewAffiliateProgramPage from "./page"

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

describe("NewAffiliateProgramPage", () => {
  beforeEach(() => {
    mockPush.mockClear()
    global.fetch = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url === "/api/proxy/affiliate-programs" && init?.method === "POST") {
        return { ok: true, status: 201, json: async () => ({ id: "p-3" }) } as Response
      }
      throw new Error(`Unhandled fetch in test: ${init?.method ?? "GET"} ${url}`)
    }) as jest.Mock
  })

  it("starts with an empty Value field", () => {
    renderWithClient(<NewAffiliateProgramPage />)

    // The client asked why this was pre-filled. Nothing in the code ever set it: Chrome was
    // autofilling a saved password into a bare type=password field with no autocomplete hint.
    // The field is now guarded (autoComplete=off, non-generic name, readOnly until focus, plus
    // an off-screen decoy that absorbs the autofill), so it starts genuinely empty.
    expect(screen.getByPlaceholderText("Value")).toHaveValue("")
  })

  it("marks the Value field so password managers skip it", () => {
    renderWithClient(<NewAffiliateProgramPage />)

    const valueField = screen.getByPlaceholderText("Value")
    expect(valueField).toHaveAttribute("autocomplete", "off")
    expect(valueField).toHaveAttribute("data-1p-ignore")
    // A generic name="value" is exactly what autofill heuristics latch onto.
    expect(valueField.getAttribute("name")).toMatch(/^credential-value-/)
  })

  it("defaults 'Has a coupon API' on, consistently", () => {
    renderWithClient(<NewAffiliateProgramPage />)

    // The dialog this replaced had two conflicting defaults for this switch (defaultValues said
    // true, its reset() said false), so what a fresh form showed depended on history.
    expect(screen.getByRole("switch", { name: /has a coupon api/i })).toBeChecked()
  })

  it("creates the program and returns to the list", async () => {
    const user = userEvent.setup()
    renderWithClient(<NewAffiliateProgramPage />)

    await user.type(screen.getByLabelText("Network name"), "Rakuten")
    await user.click(screen.getByRole("button", { name: /add program/i }))

    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/proxy/affiliate-programs",
        expect.objectContaining({ method: "POST" }),
      ),
    )
    expect(mockPush).toHaveBeenCalledWith("/admin/affiliate-programs")
  })
})
