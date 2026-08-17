"use client"

import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { ChangePasswordCard } from "@/components/settings/change-password-card"
import { useCurrentUser } from "@/lib/api/hooks/use-current-user"

export default function AdminSettingsPage() {
  const { data: currentUser, isLoading: userLoading } = useCurrentUser()

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">Settings</h2>
        <p className="text-sm text-muted-foreground">Your account.</p>
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
                <Badge variant="secondary">Admin</Badge>
              </div>
            )}
          </CardContent>
        </Card>

        <ChangePasswordCard />
      </div>
    </div>
  )
}
