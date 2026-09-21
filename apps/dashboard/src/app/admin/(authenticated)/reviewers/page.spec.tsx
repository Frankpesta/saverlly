import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import ReviewersPage from "./page"
import NewReviewerPage from "./new/page"
import type { ReviewersResponse } from "@/lib/api/hooks/use-reviewers"

jest.mock(
  "next/link",
  () =>
    function MockLink({ children, href, ...props }: React.PropsWithChildren<{ href: string }>) {
      return (
        <a href={href} {...props}>
          {children}
        </a>
      )
    },
)
jest.mock("sonner", () => ({ toast: { success: jest.fn(), error: jest.fn() } }))
let data: ReviewersResponse
function renderPage(page: React.ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return render(<QueryClientProvider client={client}>{page}</QueryClientProvider>)
}
beforeEach(() => {
  data = {
    enabled: true,
    reviewers: [
      {
        id: "r1",
        name: "Alex Review",
        email: "alex@example.com",
        codeHint: "1234",
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 86400_000).toISOString(),
        revokedAt: null,
        maxInstallations: 2,
        sessions: [
          { id: "s1", createdAt: new Date().toISOString(), lastSeenAt: new Date().toISOString() },
        ],
      },
    ],
  }
  global.fetch = jest.fn(async (input, init) => {
    const path = String(input)
    if (path === "/api/proxy/reviewers" && (!init?.method || init.method === "GET"))
      return { ok: true, json: async () => data } as Response
    if (path === "/api/proxy/reviewers/access") {
      data = { ...data, enabled: JSON.parse(String(init?.body)).enabled }
      return { ok: true, json: async () => ({}) } as Response
    }
    if (path === "/api/proxy/reviewers/r1/revoke") {
      data = {
        ...data,
        reviewers: data.reviewers.map((r) => ({ ...r, revokedAt: new Date().toISOString() })),
      }
      return { ok: true, json: async () => ({}) } as Response
    }
    if (path === "/api/proxy/reviewers" && init?.method === "POST")
      return {
        ok: true,
        json: async () => ({
          ...JSON.parse(String(init.body)),
          id: "r2",
          code: "REV-AAAA-BBBB-CCCC-DDDD-EEEE-FFFF",
        }),
      } as Response
    throw new Error("Unexpected test request: " + path)
  }) as jest.Mock
})
it("uses the collection page controls and shows activation and installation counts", async () => {
  renderPage(<ReviewersPage />)
  expect(await screen.findByText("Alex Review")).toBeInTheDocument()
  expect(screen.getByText("1 / 2")).toBeInTheDocument()
  expect(screen.getByText("Active")).toBeInTheDocument()
  expect(screen.getByRole("link", { name: "New reviewer" })).toHaveAttribute(
    "href",
    "/admin/reviewers/new",
  )
})
it("pauses reviewer access and refreshes the displayed status", async () => {
  const user = userEvent.setup()
  renderPage(<ReviewersPage />)
  await screen.findByText("Alex Review")
  await user.click(screen.getByRole("switch", { name: "Reviewer access" }))
  expect(await screen.findByText("Paused")).toBeInTheDocument()
  expect(global.fetch).toHaveBeenCalledWith(
    "/api/proxy/reviewers/access",
    expect.objectContaining({ method: "PATCH", body: '{"enabled":false}' }),
  )
})
it("revokes only after confirming the named reviewer", async () => {
  const user = userEvent.setup()
  renderPage(<ReviewersPage />)
  await user.click(await screen.findByRole("button", { name: "Revoke Alex Review" }))
  expect(screen.getByText("Revoke Alex Review?")).toBeInTheDocument()
  await user.click(screen.getByRole("button", { name: "Revoke access" }))
  expect(await screen.findByText("Revoked")).toBeInTheDocument()
})
it("creates an invite using the shared form and shows its code once", async () => {
  const user = userEvent.setup()
  renderPage(<NewReviewerPage />)
  await user.type(screen.getByLabelText("Name"), "Jamie")
  await user.click(screen.getByRole("button", { name: "Create access code" }))
  await waitFor(() =>
    expect(screen.getByLabelText("Reviewer access code")).toHaveValue(
      "REV-AAAA-BBBB-CCCC-DDDD-EEEE-FFFF",
    ),
  )
  expect(screen.getByText("Reviewer invited")).toBeInTheDocument()
  expect(global.fetch).toHaveBeenCalledWith(
    "/api/proxy/reviewers",
    expect.objectContaining({
      method: "POST",
      body: expect.stringContaining('"maxInstallations":1'),
    }),
  )
})
