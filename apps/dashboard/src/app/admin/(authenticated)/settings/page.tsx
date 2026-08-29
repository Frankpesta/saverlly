"use client"

import { Skeleton } from "@/components/ui/skeleton"
import { ChangePasswordCard } from "@/components/settings/change-password-card"
import { SettingsSection } from "@/components/settings/settings-section"
import { AccountEmailField } from "@/components/settings/account-email-field"
import { useCurrentUser } from "@/lib/api/hooks/use-current-user"
import { AdminTeamSection } from "./admin-team-section"

export default function AdminSettingsPage() {
  const { data: currentUser, isLoading: userLoading } = useCurrentUser()

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">Settings</h2>
        <p className="text-sm text-muted-foreground">Your account.</p>
      </div>

      <div className="grid grid-cols-1 items-start gap-10 lg:grid-cols-2">
        <SettingsSection title="Account" description="The identity used to manage Saverlly.">
          <div className="flex flex-col gap-3">
            {userLoading && <Skeleton className="h-10 w-full" />}
            {currentUser && (
              <AccountEmailField name={currentUser.name} email={currentUser.email} roleLabel="Admin" />
            )}
          </div>
        </SettingsSection>

        <ChangePasswordCard />

        <SettingsSection
          title="Employees"
          description="Admin-level teammates, with full access to this console. Kiosk owners and location managers are added from each kiosk's own page instead."
          className="lg:col-span-2"
        >
          <AdminTeamSection />
        </SettingsSection>
      </div>
    </div>
  )
}
