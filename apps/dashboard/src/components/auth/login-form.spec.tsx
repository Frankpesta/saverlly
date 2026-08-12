import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { LoginForm } from "@/components/auth/login-form"

const push = jest.fn()
const refresh = jest.fn()

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push, refresh }),
}))

jest.mock("../brand-logo", () => ({
  BrandLogo: () => null,
}))

describe("LoginForm", () => {
  beforeEach(() => {
    push.mockClear()
    refresh.mockClear()
    global.fetch = jest.fn()
  })

  it("submits credentials with the given portal and redirects on success", async () => {
    ;(global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ redirectTo: "/admin/kiosks" }),
    })

    render(<LoginForm portal="admin" title="Admin Console" tagline="desc" />)

    await userEvent.type(screen.getByLabelText("Email"), "admin@example.com")
    await userEvent.type(screen.getByLabelText("Password"), "secret123")
    await userEvent.click(screen.getByRole("button", { name: /sign in/i }))

    await waitFor(() => expect(push).toHaveBeenCalledWith("/admin/kiosks"))

    expect(global.fetch).toHaveBeenCalledWith(
      "/api/auth/login",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          email: "admin@example.com",
          password: "secret123",
          portal: "admin",
        }),
      }),
    )
    expect(refresh).toHaveBeenCalled()
  })

  it("shows the server's error message and does not redirect on failure", async () => {
    ;(global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      json: async () => ({
        error: "This account belongs to the Kiosk Portal. Please sign in there instead.",
      }),
    })

    render(<LoginForm portal="admin" title="Admin Console" tagline="desc" />)

    await userEvent.type(screen.getByLabelText("Email"), "owner@example.com")
    await userEvent.type(screen.getByLabelText("Password"), "secret123")
    await userEvent.click(screen.getByRole("button", { name: /sign in/i }))

    expect(
      await screen.findByText(
        "This account belongs to the Kiosk Portal. Please sign in there instead.",
      ),
    ).toBeInTheDocument()
    expect(push).not.toHaveBeenCalled()
  })

  it("shows a network error message when the request throws", async () => {
    ;(global.fetch as jest.Mock).mockRejectedValue(new Error("network down"))

    render(<LoginForm portal="portal" title="Kiosk Portal" tagline="desc" />)

    await userEvent.type(screen.getByLabelText("Email"), "owner@example.com")
    await userEvent.type(screen.getByLabelText("Password"), "secret123")
    await userEvent.click(screen.getByRole("button", { name: /sign in/i }))

    expect(
      await screen.findByText("Could not reach the server. Please try again."),
    ).toBeInTheDocument()
  })
})
