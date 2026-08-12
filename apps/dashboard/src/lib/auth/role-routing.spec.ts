import { homeUrlForRole, portalForRole } from "@/lib/auth/role-routing"

describe("portalForRole", () => {
  it("maps ADMIN to the admin portal", () => {
    expect(portalForRole("ADMIN")).toBe("admin")
  })

  it("maps KIOSK_OWNER to the kiosk portal", () => {
    expect(portalForRole("KIOSK_OWNER")).toBe("portal")
  })

  it("maps LOCATION_MANAGER to the kiosk portal", () => {
    expect(portalForRole("LOCATION_MANAGER")).toBe("portal")
  })
})

describe("homeUrlForRole", () => {
  it("sends ADMIN to /admin/overview", () => {
    expect(homeUrlForRole("ADMIN")).toBe("/admin/overview")
  })

  it("sends KIOSK_OWNER and LOCATION_MANAGER to /portal/overview", () => {
    expect(homeUrlForRole("KIOSK_OWNER")).toBe("/portal/overview")
    expect(homeUrlForRole("LOCATION_MANAGER")).toBe("/portal/overview")
  })
})
