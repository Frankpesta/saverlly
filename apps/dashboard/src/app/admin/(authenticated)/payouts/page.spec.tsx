import { act, render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import AdminPayoutsPage from "./page"
import type { Payout } from "@/lib/api/types"

const payouts: Payout[] = [
  {
    id: "payout-1",
    kioskId: "kiosk-1",
    kiosk: { id: "kiosk-1", name: "Kiosk One", stripeConnected: true, stripePayoutsEnabled: true },
    periodStart: "2026-01-01T00:00:00.000Z",
    periodEnd: "2026-01-31T00:00:00.000Z",
    totalAmount: 300,
    status: "PENDING",
    stripeTransferId: null,
    paidAt: null,
    createdAt: "2026-02-01T00:00:00.000Z",
  },
  {
    id: "payout-2",
    kioskId: "kiosk-2",
    kiosk: { id: "kiosk-2", name: "Kiosk Two", stripeConnected: false, stripePayoutsEnabled: false },
    periodStart: "2026-01-01T00:00:00.000Z",
    periodEnd: "2026-01-31T00:00:00.000Z",
    totalAmount: 150,
    status: "PENDING",
    stripeTransferId: null,
    paidAt: null,
    createdAt: "2026-02-01T00:00:00.000Z",
  },
]

function renderWithClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>)
}

describe("AdminPayoutsPage", () => {
  beforeEach(() => {
    global.fetch = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      const method = init?.method ?? "GET"

      if (url === "/api/proxy/payouts" && method === "GET") {
        return { ok: true, status: 200, json: async () => payouts } as Response
      }
      if (url === "/api/proxy/payouts/payout-1/process" && method === "POST") {
        return {
          ok: true,
          status: 200,
          json: async () => ({ ...payouts[0], status: "PROCESSING" }),
        } as Response
      }

      throw new Error(`Unhandled fetch in test: ${method} ${url}`)
    }) as jest.Mock
  })

  it("shows each payout's kiosk, amount, status, and Stripe connection", async () => {
    renderWithClient(<AdminPayoutsPage />)

    expect(await screen.findByText("Kiosk One")).toBeInTheDocument()
    expect(screen.getByText("Kiosk Two")).toBeInTheDocument()
    expect(screen.getByText("Connected")).toBeInTheDocument()
    expect(screen.getByText("Not connected")).toBeInTheDocument()
  })

  it("disables Process for a kiosk with no connected Stripe account", async () => {
    renderWithClient(<AdminPayoutsPage />)

    await screen.findByText("Kiosk Two")
    const processButtons = screen.getAllByRole("button", { name: "Process" })
    expect(processButtons[1]).toBeDisabled()
  })

  it("processes a payout after confirming", async () => {
    const user = userEvent.setup()
    renderWithClient(<AdminPayoutsPage />)

    await screen.findByText("Kiosk One")
    const processButtons = screen.getAllByRole("button", { name: "Process" })
    await user.click(processButtons[0])
    const dialog = await screen.findByRole("alertdialog")
    await user.click(within(dialog).getByRole("button", { name: "Process" }))

    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/proxy/payouts/payout-1/process",
        expect.objectContaining({ method: "POST" }),
      ),
    )
  })

  it("keeps confirmation open and prevents duplicate submits until a failed request settles", async () => {
    let finishRequest!: (response: Response) => void
    global.fetch = jest.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "POST") {
        return new Promise<Response>((resolve) => { finishRequest = resolve })
      }
      return { ok: true, status: 200, json: async () => payouts } as Response
    }) as jest.Mock
    const user = userEvent.setup()
    renderWithClient(<AdminPayoutsPage />)
    await screen.findByText("Kiosk One")
    await user.click(screen.getAllByRole("button", { name: "Process" })[0])
    const dialog = await screen.findByRole("alertdialog")
    await user.click(within(dialog).getByRole("button", { name: "Process" }))
    expect(await within(dialog).findByRole("button", { name: "Processing…" })).toBeDisabled()
    expect(within(dialog).getByRole("button", { name: "Cancel" })).toBeDisabled()
    await user.keyboard("{Escape}")
    expect(dialog).toBeInTheDocument()
    await act(async () => finishRequest({
      ok: false, status: 503, json: async () => ({ message: "Transfer service unavailable" }),
    } as Response))
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("Transfer service unavailable")
    expect(within(dialog).getByRole("button", { name: "Process" })).toBeEnabled()
    expect((global.fetch as jest.Mock).mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(1)
  })
})
