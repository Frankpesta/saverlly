import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { NotificationBell } from "@/components/notifications/notification-bell"
import type { Notification } from "@/lib/api/types"

jest.mock("next/navigation", () => ({
  usePathname: () => "/portal/overview",
}))

const notifications: Notification[] = [
  {
    id: "notif-1",
    userId: "user-1",
    type: "KIOSK_OWNER_CREATED",
    title: "Welcome to Saverlly",
    body: "Your kiosk is live.",
    metadata: null,
    readAt: null,
    createdAt: new Date().toISOString(),
  },
  {
    id: "notif-2",
    userId: "user-1",
    type: "PAYOUT_PROCESSED",
    title: "Payout sent",
    body: "$5.00 was transferred.",
    metadata: null,
    readAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
  },
]

function renderWithClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>)
}

describe("NotificationBell", () => {
  beforeEach(() => {
    global.fetch = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      const method = init?.method ?? "GET"

      if (url === "/api/proxy/notifications" && method === "GET") {
        return { ok: true, status: 200, json: async () => notifications } as Response
      }
      if (url === "/api/proxy/notifications/unread-count") {
        return { ok: true, status: 200, json: async () => ({ count: 1 }) } as Response
      }
      if (url === "/api/proxy/notifications/notif-1/read" && method === "PATCH") {
        return { ok: true, status: 200, json: async () => ({ success: true }) } as Response
      }
      if (url === "/api/proxy/notifications/read-all" && method === "PATCH") {
        return { ok: true, status: 200, json: async () => ({ success: true }) } as Response
      }

      throw new Error(`Unhandled fetch in test: ${method} ${url}`)
    }) as jest.Mock
  })

  it("shows the unread badge from useUnreadCount", async () => {
    renderWithClient(<NotificationBell />)

    expect(await screen.findByText("1")).toBeInTheDocument()
  })

  it("opens the panel and lists notifications with an unread indicator", async () => {
    renderWithClient(<NotificationBell />)

    await screen.findByText("1")
    await userEvent.click(screen.getByRole("button", { name: /notifications/i }))

    expect(await screen.findByText("Welcome to Saverlly")).toBeInTheDocument()
    expect(screen.getByText("Payout sent")).toBeInTheDocument()
  })

  it("marks an unread notification read when clicked", async () => {
    renderWithClient(<NotificationBell />)

    await screen.findByText("1")
    await userEvent.click(screen.getByRole("button", { name: /notifications/i }))
    await userEvent.click(await screen.findByText("Welcome to Saverlly"))

    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/proxy/notifications/notif-1/read",
        expect.objectContaining({ method: "PATCH" }),
      ),
    )
  })

  it("marks all read via the header action", async () => {
    renderWithClient(<NotificationBell />)

    await screen.findByText("1")
    await userEvent.click(screen.getByRole("button", { name: /notifications/i }))
    await userEvent.click(await screen.findByRole("button", { name: /mark all read/i }))

    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/proxy/notifications/read-all",
        expect.objectContaining({ method: "PATCH" }),
      ),
    )
  })

  it("opens a detail dialog with the full, untruncated body when a notification is clicked", async () => {
    renderWithClient(<NotificationBell />)

    await screen.findByText("1")
    await userEvent.click(screen.getByRole("button", { name: /notifications/i }))
    await userEvent.click(await screen.findByText("Payout sent"))

    const dialog = await screen.findByRole("dialog")
    expect(within(dialog).getByText("$5.00 was transferred.")).toBeInTheDocument()
    expect(within(dialog).getByRole("link", { name: /view earnings/i })).toHaveAttribute(
      "href",
      "/portal/earnings",
    )
  })

  it("has no action link for a notification type with no linked screen", async () => {
    renderWithClient(<NotificationBell />)

    await screen.findByText("1")
    await userEvent.click(screen.getByRole("button", { name: /notifications/i }))
    await userEvent.click(await screen.findByText("Welcome to Saverlly"))

    const dialog = await screen.findByRole("dialog")
    expect(within(dialog).queryByRole("link")).not.toBeInTheDocument()
  })
})
