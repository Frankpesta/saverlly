import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import type { StoreSetupSessionView } from "@saverlly/shared-types"
import { toast } from "sonner"
import { StoreSetupSection } from "./store-setup-section"
import { storeSetupPollInterval } from "@/lib/api/hooks/use-store-setup"
import type { Merchant } from "@/lib/api/types"

jest.mock("sonner", () => ({ toast: { success: jest.fn(), error: jest.fn() } }))

const merchant: Merchant = {
  id: "m-1",
  name: "Demo Outfitters",
  domain: "demo-outfitters.test",
  attributionMethod: "COOKIE",
  affiliateTrackingUrl: "https://track.example.com",
  affiliateUrlParamKey: null,
  affiliateUrlParamValue: null,
  affiliateProgramId: null,
  active: true,
  checkoutRecipe: null,
  createdAt: "2026-01-01T00:00:00.000Z",
}

const minutesFromNow = (m: number) => new Date(Date.now() + m * 60_000).toISOString()

function view(overrides: Partial<StoreSetupSessionView> = {}): StoreSetupSessionView {
  return {
    id: "s-1",
    merchantId: "m-1",
    state: "PENDING",
    extensionActive: false,
    codeExpiresAt: minutesFromNow(10),
    sessionExpiresAt: null,
    connectedAt: null,
    lastSeenAt: null,
    submittedAt: null,
    appliedAt: null,
    cancelledAt: null,
    createdAt: new Date().toISOString(),
    createdById: "u-1",
    appliedById: null,
    draftRecipe: null,
    testResult: null,
    ...overrides,
  }
}

const draftRecipe = {
  couponFieldSelector: 'input[name="discount"]',
  applyButtonSelector: "button.apply",
  successIndicatorSelector: "",
  failureIndicatorSelector: '[role="alert"]',
  cartTotalSelector: ".total",
  checkoutUrlPatterns: ["/checkouts/*"],
  couponApplyMode: "replace" as const,
}

function submitted(passed: boolean, overrides: Partial<StoreSetupSessionView> = {}) {
  return view({
    state: "SUBMITTED",
    extensionActive: true,
    submittedAt: new Date().toISOString(),
    sessionExpiresAt: minutesFromNow(200),
    draftRecipe,
    testResult: {
      passed,
      cartTotal: 84.2,
      testedAt: new Date().toISOString(),
      checks: [
        { key: "failureMessage", outcome: "pass", detail: "Store rejected the test code" },
        { key: "promoField", outcome: passed ? "pass" : "fail", detail: passed ? undefined : "Promo box not found" },
        { key: "successMessage", outcome: "skipped" },
      ],
    },
    ...overrides,
  })
}

let current: StoreSetupSessionView | null
let fetchMock: jest.Mock
const respond = (status: number, body: unknown) =>
  ({ ok: status < 400, status, json: async () => body }) as Response
const calls = (method: string, suffix: string) =>
  fetchMock.mock.calls.filter(
    ([url, init]) => String(url).endsWith(suffix) && (init?.method ?? "GET") === method,
  )

beforeEach(() => {
  current = null
  jest.mocked(toast.success).mockClear()
  jest.mocked(toast.error).mockClear()
  fetchMock = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    const method = init?.method ?? "GET"
    const base = "/api/proxy/merchants/m-1/setup-sessions"
    if (url === `${base}/current` && method === "GET") return respond(200, { session: current })
    if (url === base && method === "POST") {
      current = view({ id: "s-new" })
      return respond(201, { code: "SET-7K4Q-92MD", session: current })
    }
    if (url === `${base}/${current?.id}/apply` && method === "POST") {
      current = view({ ...current!, state: "APPLIED", extensionActive: false, appliedAt: new Date().toISOString() })
      return respond(200, { session: current, merchant: { ...merchant, checkoutRecipe: draftRecipe } })
    }
    if (url === `${base}/${current?.id}/cancel` && method === "POST") {
      current = view({ ...current!, state: "CANCELLED", extensionActive: false })
      return respond(200, current)
    }
    throw new Error(`Unhandled fetch in test: ${method} ${url}`)
  })
  global.fetch = fetchMock
})

function renderSection(m: Merchant = merchant) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  render(
    <QueryClientProvider client={queryClient}>
      <StoreSetupSection merchant={m} />
    </QueryClientProvider>,
  )
  return queryClient
}

it("gets a one-time code and shows how to use it", async () => {
  const user = userEvent.setup()
  renderSection()
  await user.click(await screen.findByRole("button", { name: "Get setup code" }))

  expect(await screen.findByText("SET-7K4Q-92MD")).toBeInTheDocument()
  expect(screen.getByText(/^Expires in (10:00|9:5\d)$/)).toBeInTheDocument()
  expect(screen.getByText(/right-click the Saverlly icon/)).toBeInTheDocument()
  expect(screen.getByText("Waiting for extension")).toBeInTheDocument()
  expect(screen.getByRole("status")).toHaveTextContent("Waiting for the extension…")
})

it("never shows a code it no longer has, such as after a reload", async () => {
  current = view()
  renderSection()
  expect(await screen.findByText(/codes are only shown once/)).toBeInTheDocument()
  expect(screen.queryByText(/^SET-/)).not.toBeInTheDocument()
  expect(screen.getByRole("button", { name: "Get a new code" })).toBeInTheDocument()
})

it("shows when the extension has connected", async () => {
  current = view({ state: "CONNECTED", extensionActive: true, sessionExpiresAt: minutesFromNow(230) })
  renderSection()
  expect(await screen.findByText("Extension connected")).toBeInTheDocument()
  expect(screen.getByText(/Follow its steps on demo-outfitters.test/)).toBeInTheDocument()
})

it("shows the test result in plain language and saves the draft", async () => {
  const user = userEvent.setup()
  current = submitted(true)
  const queryClient = renderSection()

  const list = await screen.findByRole("list", { name: "Test result" })
  const rows = within(list).getAllByRole("listitem")
  expect(rows.map((row) => row.textContent)).toEqual([
    "Promo code box: Passed",
    "Message for a rejected code: PassedStore rejected the test code",
    "Message for an accepted code: Skipped",
  ])
  expect(screen.getByText("$84.20")).toBeInTheDocument()
  expect(screen.getByText("Ready to save")).toBeInTheDocument()

  await user.click(screen.getByRole("button", { name: "Save recipe to store" }))
  await waitFor(() => expect(calls("POST", "/s-1/apply")).toHaveLength(1))
  expect(toast.success).toHaveBeenCalledWith("Checkout recipe saved for Demo Outfitters.")
  expect(await screen.findByText(/Last set up with the extension/)).toBeInTheDocument()
  expect(queryClient.getQueryData<Merchant>(["merchants", "m-1"])?.checkoutRecipe).toEqual(draftRecipe)
})

it("asks before saving a recipe that failed its test", async () => {
  const user = userEvent.setup()
  current = submitted(false)
  renderSection()

  expect(await screen.findByText("Needs attention")).toBeInTheDocument()
  expect(screen.getByText("Promo box not found")).toBeInTheDocument()
  await user.click(screen.getByRole("button", { name: "Save recipe to store" }))
  expect(await screen.findByText("Save a recipe that didn't pass?")).toBeInTheDocument()
  expect(calls("POST", "/apply")).toHaveLength(0)
  await user.click(screen.getByRole("button", { name: "Save anyway" }))
  await waitFor(() => expect(calls("POST", "/s-1/apply")).toHaveLength(1))
})

it("warns before a new code discards a waiting draft", async () => {
  const user = userEvent.setup()
  current = submitted(true)
  renderSection()

  await user.click(await screen.findByRole("button", { name: "Run setup again" }))
  expect(await screen.findByText("Discard the waiting draft?")).toBeInTheDocument()
  expect(calls("POST", "/setup-sessions")).toHaveLength(0)
  await user.click(screen.getByRole("button", { name: "Go back" }))
  expect(calls("POST", "/setup-sessions")).toHaveLength(0)

  await user.click(screen.getByRole("button", { name: "Run setup again" }))
  await user.click(await screen.findByRole("button", { name: "Discard and get a new code" }))
  expect(await screen.findByText("SET-7K4Q-92MD")).toBeInTheDocument()
})

it("discards a draft", async () => {
  const user = userEvent.setup()
  current = submitted(true)
  renderSection()
  await user.click(await screen.findByRole("button", { name: "Discard" }))
  await waitFor(() => expect(calls("POST", "/s-1/cancel")).toHaveLength(1))
  expect(toast.success).toHaveBeenCalledWith("Draft discarded.")
  expect(await screen.findByRole("button", { name: "Get setup code" })).toBeInTheDocument()
})

it("reports a save conflict and reloads the session instead of keeping the stale draft", async () => {
  const user = userEvent.setup()
  current = submitted(true)
  const base = fetchMock.getMockImplementation()!
  fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
    if (String(input).endsWith("/apply")) {
      current = view({ ...current!, state: "CANCELLED", extensionActive: false })
      return respond(409, { message: "There is no submitted recipe to save" })
    }
    return base(input, init)
  })
  renderSection()
  await user.click(await screen.findByRole("button", { name: "Save recipe to store" }))
  await waitFor(() =>
    expect(toast.error).toHaveBeenCalledWith("There is no submitted recipe to save"),
  )
  expect(await screen.findByRole("button", { name: "Get setup code" })).toBeInTheDocument()
})

it("tells the admin that saving replaces an existing recipe", async () => {
  current = submitted(true)
  renderSection({ ...merchant, checkoutRecipe: { couponFieldSelector: "#old" } })
  expect(await screen.findByText("Saving replaces this store's current checkout recipe.")).toBeInTheDocument()
})

it("polls quickly while waiting on the extension, slowly for a live draft, and not at all otherwise", () => {
  expect(storeSetupPollInterval(null)).toBe(false)
  expect(storeSetupPollInterval(view())).toBe(3_000)
  expect(storeSetupPollInterval(view({ state: "CONNECTED" }))).toBe(3_000)
  expect(storeSetupPollInterval(submitted(true))).toBe(15_000)
  expect(storeSetupPollInterval(submitted(true, { extensionActive: false }))).toBe(false)
  for (const state of ["APPLIED", "CANCELLED", "EXPIRED"] as const)
    expect(storeSetupPollInterval(view({ state }))).toBe(false)
})
