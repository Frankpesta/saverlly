"use client"

import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { ChangePasswordCard } from "@/components/settings/change-password-card"
import { SettingsSection } from "@/components/settings/settings-section"
import { AccountEmailField } from "@/components/settings/account-email-field"
import { useCurrentUser } from "@/lib/api/hooks/use-current-user"
import { useKiosk, useKioskContact } from "@/lib/api/hooks/use-kiosks"
import { KIOSK_STATUS_BADGE_VARIANT, KIOSK_STATUS_LABEL } from "@/lib/dashboard/status-labels"
import { TeamSection } from "./team-section"

const SUPPORT_EMAIL = process.env.NEXT_PUBLIC_SUPPORT_EMAIL

const ROLE_LABEL: Record<string, string> = {
  ADMIN: "Admin",
  KIOSK_OWNER: "Kiosk owner",
  LOCATION_MANAGER: "Location manager",
}

export default function PortalSettingsPage() {
  const { data: currentUser, isLoading: userLoading } = useCurrentUser()
  const isKioskOwner = currentUser?.role === "KIOSK_OWNER"
  // GET /kiosks/:id is ADMIN/KIOSK_OWNER only, a location manager would get a 403, so only fetch
  // it (and the team roster below) when the current user is actually allowed to see it.
  const { data: kiosk, isLoading: kioskLoading } = useKiosk(isKioskOwner ? (currentUser?.kioskId ?? "") : "")
  // A location manager can't load the kiosk itself, but is allowed this narrow projection
  // just enough to know who their kiosk owner is.
  const { data: kioskContact } = useKioskContact(!userLoading && !isKioskOwner)

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-title">Settings</h2>
      </div>

      <div className="grid grid-cols-1 items-start gap-10 lg:grid-cols-2">
        <SettingsSection title="Account" description="The identity and access level for this workspace.">
          <div className="flex flex-col gap-3">
            {userLoading && <Skeleton className="h-10 w-full" />}
            {currentUser && (
              <AccountEmailField
                name={currentUser.name}
                email={currentUser.email}
                roleLabel={ROLE_LABEL[currentUser.role] ?? currentUser.role}
              />
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
                  <p className="text-sm text-muted-foreground">
                    Contact{" "}
                    {SUPPORT_EMAIL ? (
                      <a href={`mailto:${SUPPORT_EMAIL}`} className="text-[var(--brand-teal)] hover:underline">
                        your Saverlly admin
                      </a>
                    ) : (
                      "your Saverlly admin"
                    )}{" "}
                    to change these details.
                  </p>
                </>
              )}
            </div>
          </SettingsSection>
        )}

        {isKioskOwner && currentUser?.kioskId && <TeamSection kioskId={currentUser.kioskId} />}

        {!userLoading && !isKioskOwner && (
          <SettingsSection title="Workspace access">
            <p className="text-sm text-muted-foreground">
              Contact{" "}
              {kioskContact?.email ? (
                <a
                  href={`mailto:${kioskContact.email}`}
                  className="text-[var(--brand-teal)] hover:underline"
                >
                  {kioskContact.name || "your kiosk owner"}
                </a>
              ) : (
                "your kiosk owner"
              )}{" "}
              to manage kiosk details or team access.
            </p>
          </SettingsSection>
        )}
      </div>
    </div>
  )
}
