import {
  LayoutDashboardIcon,
  MapPinIcon,
  MonitorIcon,
  MegaphoneIcon,
  WalletIcon,
  SettingsIcon,
} from "lucide-react"
import { AuthenticatedShell } from "@/components/authenticated-shell"
import { getCurrentUser } from "@/lib/auth/session"

const navMain = [
  { title: "Overview", url: "/portal/overview", icon: <LayoutDashboardIcon /> },
  { title: "Locations", url: "/portal/locations", icon: <MapPinIcon /> },
  { title: "Devices", url: "/portal/devices", icon: <MonitorIcon /> },
  { title: "Announcements", url: "/portal/announcements", icon: <MegaphoneIcon /> },
  // Earnings (commissions/payouts) is a KIOSK_OWNER-only concept server-side — a location
  // manager hitting it would just get 403s throughout, so it's excluded below for that role.
  { title: "Earnings", url: "/portal/earnings", icon: <WalletIcon />, ownerOnly: true },
]

const navSecondary = [
  { title: "Settings", url: "/portal/settings", icon: <SettingsIcon /> },
]

export default async function PortalLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const user = await getCurrentUser()
  const isKioskOwner = user?.role === "KIOSK_OWNER"
  const visibleNavMain = navMain.filter((item) => !item.ownerOnly || isKioskOwner)

  return (
    <AuthenticatedShell
      homeUrl="/portal/overview"
      loginPath="/portal/login"
      fallbackTitle="Kiosk Portal"
      navMain={visibleNavMain}
      navSecondary={navSecondary}
      user={{ name: user?.name || user?.email || "Owner", email: user?.email ?? "" }}
    >
      {children}
    </AuthenticatedShell>
  )
}
