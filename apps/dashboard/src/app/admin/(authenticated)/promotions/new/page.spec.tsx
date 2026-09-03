import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import NewPromotionPage from "./page"
import type { Location } from "@/lib/api/types"

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

const locations: Location[] = [
  {
    id: "loc-1",
    kioskId: "kiosk-1",
    name: "Downtown",
    address: "1 Main St",
    city: "Springfield",
    state: "IL",
    zip: "00000",
    latitude: null,
    longitude: null,
    tags: ["mall"],
    locationSetupCode: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
]

function renderWithClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>)
}

describe("NewPromotionPage targeting", () => {
  beforeEach(() => {
    mockPush.mockClear()
    global.fetch = jest.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url === "/api/proxy/locations") {
        return { ok: true, status: 200, json: async () => locations } as Response
      }
      throw new Error(`Unhandled fetch in test: ${url}`)
    }) as jest.Mock
  })

  it("defaults to Show everywhere", async () => {
    renderWithClient(<NewPromotionPage />)
    expect(await screen.findByRole("switch", { name: /show everywhere/i })).toBeChecked()
  })

  // The client's report was that this box could not be unchecked. "everywhere" used to be
  // derived from targetTags/locationIds both being empty, so turning it off wrote two empty
  // arrays, which recomputed straight back to "everywhere" and snapped the switch on again.
  it("can be turned off, and stays off, revealing the tag and location pickers", async () => {
    const user = userEvent.setup()
    renderWithClient(<NewPromotionPage />)

    const everywhere = await screen.findByRole("switch", { name: /show everywhere/i })
    await user.click(everywhere)

    await waitFor(() => expect(everywhere).not.toBeChecked())
    expect(screen.getByLabelText("Location tags")).toBeInTheDocument()
    expect(screen.getByText("Specific locations")).toBeInTheDocument()
  })

  it("toggles back on and off again without sticking", async () => {
    const user = userEvent.setup()
    renderWithClient(<NewPromotionPage />)

    const everywhere = await screen.findByRole("switch", { name: /show everywhere/i })
    await user.click(everywhere)
    await waitFor(() => expect(everywhere).not.toBeChecked())
    await user.click(everywhere)
    await waitFor(() => expect(everywhere).toBeChecked())
    await user.click(everywhere)
    await waitFor(() => expect(everywhere).not.toBeChecked())
  })

  it("refuses to submit with targeting off but nothing actually targeted", async () => {
    const user = userEvent.setup()
    renderWithClient(<NewPromotionPage />)

    const everywhere = await screen.findByRole("switch", { name: /show everywhere/i })
    await user.click(everywhere)
    await user.click(screen.getByRole("button", { name: /publish promotion/i }))

    // Empty targeting is what the API reads as "everywhere", so submitting it here would
    // silently do the opposite of what the switch says.
    expect(
      await screen.findByText(/pick at least one tag or location/i),
    ).toBeInTheDocument()
  })
})
