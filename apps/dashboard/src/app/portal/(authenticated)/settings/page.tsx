"use client"

import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { ChangePasswordCard } from "@/components/settings/change-password-card"
import { SettingsSection } from "@/components/settings/settings-section"
import { useCurrentUser } from "@/lib/api/hooks/use-current-user"
import { useKiosk } from "@/lib/api/hooks/use-kiosks"
import { KIOSK_STATUS_BADGE_VARIANT, KIOSK_STATUS_LABEL } from "@/lib/dashboard/status-labels"
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

      <div className="grid grid-cols-1 items-start gap-10 lg:grid-cols-2">
        <SettingsSection title="Account" description="The identity and access level for this workspace.">
          <div className="flex flex-col gap-3">
            {userLoading && <Skeleton className="h-10 w-full" />}
            {currentUser && (
              <div className="flex items-center justify-between border-y border-black/[0.06] py-3">
                <span className="text-sm font-medium">{currentUser.email}</span>
                <Badge variant="secondary">{ROLE_LABEL[currentUser.role] ?? currentUser.role}</Badge>
              </div>
            )}
          </div>
        </SettingsSection>

        <ChangePasswordCard />

        {isKioskOwner && (
          <SettingsSection title="Kiosk" description="Managed by your Saverlly administrator.">
            <div className="flex flex-col gap-3">
              {kioskLoading && <Skeleton className="h-10 w-full" />}
              {kiosk && (
                <>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Name</span>
                    <span className="text-sm font-medium">{kiosk.name}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Status</span>
                    <Badge variant={KIOSK_STATUS_BADGE_VARIANT[kiosk.status]}>
                      {KIOSK_STATUS_LABEL[kiosk.status]}
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
            </div>
          </SettingsSection>
        )}

        {isKioskOwner && currentUser?.kioskId && <TeamSection kioskId={currentUser.kioskId} />}

        {!userLoading && !isKioskOwner && (
          <SettingsSection title="Workspace access">
            <p className="text-sm text-muted-foreground">Contact your kiosk owner to manage kiosk details or team access.</p>
          </SettingsSection>
        )}
      </div>
    </div>
  )
}
