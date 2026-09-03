import {
  LayoutDashboardIcon,
  StoreIcon,
  MapPinIcon,
  MonitorIcon,
  ShoppingBagIcon,
  TagIcon,
  DatabaseIcon,
  LinkIcon,
  PercentIcon,
  CreditCardIcon,
  MegaphoneIcon,
  SettingsIcon,
} from "lucide-react"
import { AuthenticatedShell } from "@/components/authenticated-shell"
import { getCurrentUser } from "@/lib/auth/session"

// No top-level "Users" item. User onboarding is kiosk-scoped (POST /kiosks/:kioskId/users),
// not a flat cross-kiosk list, so it lives on each kiosk's own detail page instead.
const navMain = [
  { title: "Overview", url: "/admin/overview", icon: <LayoutDashboardIcon /> },
  { title: "Kiosks", url: "/admin/kiosks", icon: <StoreIcon /> },
  { title: "Locations", url: "/admin/locations", icon: <MapPinIcon /> },
  { title: "Devices", url: "/admin/devices", icon: <MonitorIcon /> },
  // Promotions replaced admin-side Announcements outright, announcements are now a kiosk-owner
  // feature in the portal only. See apps/dashboard/src/app/portal/(authenticated)/announcements.
  { title: "Promotions", url: "/admin/promotions", icon: <MegaphoneIcon /> },
  { title: "Merchants", url: "/admin/merchants", icon: <ShoppingBagIcon /> },
  { title: "Coupons", url: "/admin/coupons", icon: <TagIcon /> },
  { title: "Scrape Sources", url: "/admin/scrape-sources", icon: <DatabaseIcon /> },
  { title: "Affiliate Programs", url: "/admin/affiliate-programs", icon: <LinkIcon /> },
  { title: "Commissions", url: "/admin/commissions", icon: <PercentIcon /> },
  { title: "Payouts", url: "/admin/payouts", icon: <CreditCardIcon /> },
]

const navSecondary = [
  { title: "Settings", url: "/admin/settings", icon: <SettingsIcon /> },
]

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const user = await getCurrentUser()

  return (
    <AuthenticatedShell
      homeUrl="/admin/overview"
      loginPath="/admin/login"
      fallbackTitle="Admin Console"
      navMain={navMain}
      navSecondary={navSecondary}
      user={{ name: user?.email ?? "Admin", email: user?.email ?? "" }}
    >
      {children}
    </AuthenticatedShell>
  )
}
