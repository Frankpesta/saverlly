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
  { title: "Earnings", url: "/portal/earnings", icon: <WalletIcon /> },
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

  return (
    <AuthenticatedShell
      homeUrl="/portal/overview"
      loginPath="/portal/login"
      fallbackTitle="Kiosk Portal"
      navMain={navMain}
      navSecondary={navSecondary}
      user={{ name: user?.email ?? "Owner", email: user?.email ?? "" }}
    >
      {children}
    </AuthenticatedShell>
  )
}
