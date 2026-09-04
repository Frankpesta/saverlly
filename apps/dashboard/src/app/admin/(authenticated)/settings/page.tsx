"use client"

import { ChangePasswordCard } from "@/components/settings/change-password-card"
import { SettingsSection } from "@/components/settings/settings-section"
import { AdminTeamSection } from "./admin-team-section"
import { PlatformSection } from "./platform-section"

/**
 * Employees, platform-wide configuration, and changing your own password.
 *
 * Identity (name, email, photo, role, access scope) used to be an "Account" section here. It
 * has its own page now, at /admin/profile, so this page stopped being a place where personal
 * details and workspace administration sat side by side under one heading.
 */
export default function AdminSettingsPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-title">Settings</h2>
      </div>

      <div className="grid grid-cols-1 items-start gap-10">
        <SettingsSection
          title="Employees"
          description="Admin-level teammates, with full access to this console. Kiosk owners and location managers are added from each kiosk's own page instead."
        >
          <AdminTeamSection />
        </SettingsSection>

        <PlatformSection />

        {/* Anchored so the profile page's "Change password" button lands on it. */}
        <div id="password" className="scroll-mt-24 max-w-xl">
          <ChangePasswordCard />
        </div>
      </div>
    </div>
  )
}
