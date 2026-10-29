import { render, screen } from "@testing-library/react"
import { NotificationDetailDialog } from "./notification-detail-dialog"
import type { Notification } from "@/lib/api/types"

const recheck: Notification = {
  id: "n-1",
  userId: "u-1",
  type: "STORE_NEEDS_RECHECK",
  title: "Demo Outfitters needs a quick re-check",
  body: "Shoppers' checkouts show a promo box the saved setup no longer finds. Open the store and get a setup code to fix it.",
  metadata: { merchantId: "m-1" },
  readAt: null,
  createdAt: new Date().toISOString(),
}

it("takes an admin straight to the store's setup to re-check it", () => {
  render(<NotificationDetailDialog notification={recheck} basePath="/admin" open onOpenChange={() => {}} />)
  expect(screen.getByText("Stores")).toBeInTheDocument()
  expect(screen.getByRole("link", { name: "Re-check the store" })).toHaveAttribute(
    "href",
    "/admin/merchants/m-1#store-setup",
  )
})
