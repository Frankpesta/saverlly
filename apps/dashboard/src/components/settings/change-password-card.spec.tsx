import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { toast } from "sonner"
import { ChangePasswordCard } from "@/components/settings/change-password-card"

jest.mock("sonner", () => ({
  toast: { info: jest.fn(), error: jest.fn(), success: jest.fn() },
}))

describe("ChangePasswordCard", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    global.fetch = jest.fn()
  })

  it("submits current + new password and shows a success toast, then clears the form", async () => {
    ;(global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ success: true }),
    })

    render(<ChangePasswordCard />)

    await userEvent.type(screen.getByLabelText("Current password"), "MyPassword123!")
    await userEvent.type(screen.getByLabelText("New password"), "NewPassword123!")
    await userEvent.type(screen.getByLabelText("Confirm new password"), "NewPassword123!")
    await userEvent.click(screen.getByRole("button", { name: /update password/i }))

    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Password updated."))

    expect(global.fetch).toHaveBeenCalledWith(
      "/api/auth/change-password",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ currentPassword: "MyPassword123!", newPassword: "NewPassword123!" }),
      }),
    )
    expect(screen.getByLabelText("Current password")).toHaveValue("")
    expect(screen.getByLabelText("New password")).toHaveValue("")
  })

  it("shows an inline error and does not submit when the new passwords don't match", async () => {
    render(<ChangePasswordCard />)

    await userEvent.type(screen.getByLabelText("Current password"), "MyPassword123!")
    await userEvent.type(screen.getByLabelText("New password"), "NewPassword123!")
    await userEvent.type(screen.getByLabelText("Confirm new password"), "Mismatch123!")
    await userEvent.click(screen.getByRole("button", { name: /update password/i }))

    expect(await screen.findByText("New passwords don't match.")).toBeInTheDocument()
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it("shows the server's error message on a wrong current password", async () => {
    ;(global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      json: async () => ({ error: "Current password is incorrect" }),
    })

    render(<ChangePasswordCard />)

    await userEvent.type(screen.getByLabelText("Current password"), "WrongPassword!")
    await userEvent.type(screen.getByLabelText("New password"), "NewPassword123!")
    await userEvent.type(screen.getByLabelText("Confirm new password"), "NewPassword123!")
    await userEvent.click(screen.getByRole("button", { name: /update password/i }))

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("Current password is incorrect"),
    )
  })
})
