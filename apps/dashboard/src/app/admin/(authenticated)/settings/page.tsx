"use client"

import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { ChangePasswordCard } from "@/components/settings/change-password-card"
import { SettingsSection } from "@/components/settings/settings-section"
import { useCurrentUser } from "@/lib/api/hooks/use-current-user"

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
              <div className="flex items-center justify-between border-y border-black/[0.06] dark:border-white/10 py-3">
                <span className="text-sm font-medium">{currentUser.email}</span>
                <Badge variant="secondary">Admin</Badge>
              </div>
            )}
          </div>
        </SettingsSection>

        <ChangePasswordCard />
      </div>
    </div>
  )
}
