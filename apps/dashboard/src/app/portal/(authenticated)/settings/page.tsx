"use client"

import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { ChangePasswordCard } from "@/components/settings/change-password-card"
import { useCurrentUser } from "@/lib/api/hooks/use-current-user"
import { useKiosk } from "@/lib/api/hooks/use-kiosks"
import { TeamSection } from "./team-section"

const ROLE_LABEL: Record<string, string> = {
  ADMIN: "Admin",
  KIOSK_OWNER: "Kiosk owner",
  LOCATION_MANAGER: "Location manager",
}

export default function PortalSettingsPage() {
  const { data: currentUser, isLoading: userLoading } = useCurrentUser()
  const isKioskOwner = currentUser?.role === "KIOSK_OWNER"
  // GET /kiosks/:id is ADMIN/KIOSK_OWNER only — a location manager would get a 403, so only fetch
  // it (and the team roster below) when the current user is actually allowed to see it.
  const { data: kiosk, isLoading: kioskLoading } = useKiosk(isKioskOwner ? (currentUser?.kioskId ?? "") : "")

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">Settings</h2>
        <p className="text-sm text-muted-foreground">Your account, kiosk, and team.</p>
      </div>

      <div className="flex flex-wrap items-start gap-6">
        <Card className="w-full max-w-lg">
          <CardHeader>
            <CardTitle>Account</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {userLoading && <Skeleton className="h-10 w-full" />}
            {currentUser && (
              <div className="flex items-center justify-between rounded-xl border border-black/8 px-4 py-3">
                <span className="text-sm font-medium">{currentUser.email}</span>
                <Badge variant="secondary">{ROLE_LABEL[currentUser.role] ?? currentUser.role}</Badge>
              </div>
            )}
          </CardContent>
        </Card>

        <ChangePasswordCard />

        {isKioskOwner && (
          <Card className="w-full max-w-lg">
            <CardHeader>
              <CardTitle>Kiosk</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {kioskLoading && <Skeleton className="h-10 w-full" />}
              {kiosk && (
                <>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Name</span>
                    <span className="text-sm font-medium">{kiosk.name}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Status</span>
                    <Badge variant={kiosk.status === "ACTIVE" ? "default" : "secondary"}>
                      {kiosk.status}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Revenue share</span>
                    <span className="text-sm font-medium">{kiosk.revenueSharePct}%</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Contact email</span>
                    <span className="text-sm font-medium">{kiosk.contactEmail}</span>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Contact your Saverlly admin to change these details.
                  </p>
                </>
              )}
            </CardContent>
          </Card>
        )}

        {isKioskOwner && currentUser?.kioskId && <TeamSection kioskId={currentUser.kioskId} />}

        {!userLoading && !isKioskOwner && (
          <Card className="w-full max-w-lg">
            <CardContent className="pt-6">
              <p className="text-sm text-muted-foreground">
                Contact your kiosk owner to manage kiosk details or team access.
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
