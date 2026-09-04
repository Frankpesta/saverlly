"use client"

import Link from "next/link"
import { ChangePasswordCard } from "@/components/settings/change-password-card"
import { SettingsSection } from "@/components/settings/settings-section"
import { useCurrentUser } from "@/lib/api/hooks/use-current-user"
import { useKioskContact } from "@/lib/api/hooks/use-kiosks"
import { TeamSection } from "./team-section"

/**
 * Two things only: who else can get in, and changing your own password.
 *
 * Identity and kiosk details used to be "Account" and "Kiosk" sections here. Both moved to
 * /portal/profile, so this page stopped mixing personal details with team administration.
 */
export default function PortalSettingsPage() {
  const { data: currentUser, isLoading: userLoading } = useCurrentUser()
  const isKioskOwner = currentUser?.role === "KIOSK_OWNER"
  // A location manager can't load their own kiosk, but is allowed this narrow projection,
  // just enough to know who to ask about access.
  const { data: kioskContact } = useKioskContact(!userLoading && !isKioskOwner)

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-title">Settings</h2>
      </div>

      <div className="grid grid-cols-1 items-start gap-10">
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
              to change your locations or team access. Your own name, email and photo are on your{" "}
              <Link href="/portal/profile" className="text-[var(--brand-teal)] hover:underline">
                profile
              </Link>
              .
            </p>
          </SettingsSection>
        )}

        {/* Anchored so the profile page's "Change password" button lands on it. */}
        <div id="password" className="scroll-mt-24 max-w-xl">
          <ChangePasswordCard />
        </div>
      </div>
    </div>
  )
}
