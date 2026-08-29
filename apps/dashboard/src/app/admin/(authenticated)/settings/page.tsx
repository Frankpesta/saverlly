"use client"

import Link from "next/link"
import { ArrowRightIcon } from "lucide-react"
import { Skeleton } from "@/components/ui/skeleton"
import { ChangePasswordCard } from "@/components/settings/change-password-card"
import { SettingsSection } from "@/components/settings/settings-section"
import { AccountEmailField } from "@/components/settings/account-email-field"
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
              <AccountEmailField name={currentUser.name} email={currentUser.email} roleLabel="Admin" />
            )}
          </div>
        </SettingsSection>

        <ChangePasswordCard />

        <SettingsSection
          title="Team"
          description="Kiosk owners and location managers are added from each kiosk's own page."
        >
          <Link
            href="/admin/kiosks"
            className="flex w-fit items-center gap-1.5 text-sm font-medium text-[var(--brand-teal)] hover:underline"
          >
            Go to Kiosks to add a user
            <ArrowRightIcon className="size-4" />
          </Link>
        </SettingsSection>
      </div>
    </div>
  )
}
