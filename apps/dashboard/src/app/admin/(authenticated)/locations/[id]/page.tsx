"use client"

import * as React from "react"
import Link from "next/link"
import { useParams } from "next/navigation"
import { toast } from "sonner"
import { ArrowLeftIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { FormField, FormGrid } from "@/components/dashboard/form-section"
import { useLocation, useUpdateLocation } from "@/lib/api/hooks/use-locations"
import { useKiosks } from "@/lib/api/hooks/use-kiosks"
import { ApiError } from "@/lib/api/client"
import type { Location } from "@/lib/api/types"
import { SetupCodesSection } from "./setup-codes-section"
import { LocationDevicesSection } from "./location-devices-section"

export default function AdminLocationDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { data: location, isLoading, isError } = useLocation(id)
  const { data: kiosks } = useKiosks()
  const kioskName = kiosks?.find((k) => k.id === location?.kioskId)?.name

  return (
    <div className="flex flex-col gap-6">
      <div className="border-b border-black/[0.09] pb-6">
        <Link href="/admin/locations" className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeftIcon className="size-4" />
          Locations
        </Link>
        <p className="mt-5 text-xs font-semibold tracking-[0.08em] text-muted-foreground uppercase">Location profile</p>
        <h2 className="mt-1 text-2xl font-semibold tracking-tight">{location?.name ?? "Location"}</h2>
        {kioskName && <p className="mt-1 text-sm text-muted-foreground">{kioskName}</p>}
      </div>

      {isError && <p className="text-sm text-destructive">Could not load this location.</p>}
      {isLoading && <Skeleton className="h-64 w-full max-w-lg" />}

      {location && (
        <div className="grid grid-cols-1 items-start gap-10 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
          <Card>
            <CardHeader>
              <CardTitle>Location details</CardTitle>
            </CardHeader>
            <LocationEditForm key={location.id} location={location} />
          </Card>

          <SetupCodesSection locationId={location.id} />
          <LocationDevicesSection locationId={location.id} />
        </div>
      )}
    </div>
  )
}

function LocationEditForm({ location }: { location: Location }) {
  const updateLocation = useUpdateLocation(location.id)
  const [name, setName] = React.useState(location.name)
  const [address, setAddress] = React.useState(location.address)
  const [city, setCity] = React.useState(location.city)
  const [state, setState] = React.useState(location.state)
  const [country, setCountry] = React.useState(location.country)
  const [tags, setTags] = React.useState(location.tags.join(", "))

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    const tagList = tags
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean)

    updateLocation.mutate(
      { name, address, city, state, country, tags: tagList },
      {
        onSuccess: () => toast.success("Location updated."),
        onError: (error) =>
          toast.error(error instanceof ApiError ? error.message : "Could not update location."),
      },
    )
  }

  return (
    <form onSubmit={handleSubmit}>
      <CardContent className="flex flex-col gap-4">
        <FormGrid>
          <FormField label="Name" htmlFor="loc-name">
            <Input id="loc-name" value={name} onChange={(e) => setName(e.target.value)} required />
          </FormField>
          <FormField label="Address" htmlFor="loc-address">
            <Input
              id="loc-address"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              required
            />
          </FormField>
        </FormGrid>
        <FormGrid>
          <FormField label="City" htmlFor="loc-city">
            <Input id="loc-city" value={city} onChange={(e) => setCity(e.target.value)} required />
          </FormField>
          <FormField label="State" htmlFor="loc-state">
            <Input
              id="loc-state"
              value={state}
              onChange={(e) => setState(e.target.value)}
              required
            />
          </FormField>
        </FormGrid>
        <FormField label="Country" htmlFor="loc-country">
          <Input
            id="loc-country"
            value={country}
            onChange={(e) => setCountry(e.target.value)}
            required
          />
        </FormField>
        <FormField label="Tags" htmlFor="loc-tags">
          <Input id="loc-tags" value={tags} onChange={(e) => setTags(e.target.value)} />
        </FormField>
      </CardContent>
      <CardFooter>
        <Button type="submit" disabled={updateLocation.isPending}>
          {updateLocation.isPending ? "Saving…" : "Save changes"}
        </Button>
      </CardFooter>
    </form>
  )
}
