import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { ChangePasswordForm } from "@/components/auth/change-password-form"

const push = jest.fn()
const refresh = jest.fn()

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push, refresh }),
}))

jest.mock("../brand-logo", () => ({
  BrandLogo: () => null,
}))

describe("ChangePasswordForm", () => {
  beforeEach(() => {
    push.mockClear()
    refresh.mockClear()
    global.fetch = jest.fn()
  })

  it("submits current + new password and redirects to homeUrl on success", async () => {
    ;(global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ success: true }),
    })

    render(<ChangePasswordForm homeUrl="/admin/overview" tagline="Almost there." />)

    await userEvent.type(screen.getByLabelText("Current password"), "TempPass123!")
    await userEvent.type(screen.getByLabelText("New password"), "NewPassword123!")
    await userEvent.type(screen.getByLabelText("Confirm new password"), "NewPassword123!")
    await userEvent.click(screen.getByRole("button", { name: /set new password/i }))

    await waitFor(() => expect(push).toHaveBeenCalledWith("/admin/overview"))

    expect(global.fetch).toHaveBeenCalledWith(
      "/api/auth/change-password",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ currentPassword: "TempPass123!", newPassword: "NewPassword123!" }),
      }),
    )
    expect(refresh).toHaveBeenCalled()
  })

  it("shows a client-side error and does not submit when the new passwords don't match", async () => {
    render(<ChangePasswordForm homeUrl="/admin/overview" tagline="Almost there." />)

    await userEvent.type(screen.getByLabelText("Current password"), "TempPass123!")
    await userEvent.type(screen.getByLabelText("New password"), "NewPassword123!")
    await userEvent.type(screen.getByLabelText("Confirm new password"), "Mismatch123!")
    await userEvent.click(screen.getByRole("button", { name: /set new password/i }))

    expect(await screen.findByText("New passwords don't match.")).toBeInTheDocument()
    expect(global.fetch).not.toHaveBeenCalled()
    expect(push).not.toHaveBeenCalled()
  })

  it("shows the server's error message on a wrong current password and does not redirect", async () => {
    ;(global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      json: async () => ({ error: "Current password is incorrect" }),
    })

    render(<ChangePasswordForm homeUrl="/admin/overview" tagline="Almost there." />)

    await userEvent.type(screen.getByLabelText("Current password"), "WrongPassword!")
    await userEvent.type(screen.getByLabelText("New password"), "NewPassword123!")
    await userEvent.type(screen.getByLabelText("Confirm new password"), "NewPassword123!")
    await userEvent.click(screen.getByRole("button", { name: /set new password/i }))

    expect(await screen.findByText("Current password is incorrect")).toBeInTheDocument()
    expect(push).not.toHaveBeenCalled()
  })
})
