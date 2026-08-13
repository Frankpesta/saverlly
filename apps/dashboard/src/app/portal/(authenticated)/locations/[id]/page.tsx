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
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { useLocation, useUpdateLocation } from "@/lib/api/hooks/use-locations"
import { ApiError } from "@/lib/api/client"
import type { Location } from "@/lib/api/types"
import { SetupCodesSection } from "./setup-codes-section"
import { LocationDevicesSection } from "./location-devices-section"

export default function LocationDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { data: location, isLoading, isError } = useLocation(id)

  return (
    <div className="flex flex-col gap-6">
      <Link
        href="/portal/locations"
        className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:underline"
      >
        <ArrowLeftIcon className="size-4" />
        Back to Locations
      </Link>

      {isError && <p className="text-sm text-destructive">Could not load this location.</p>}
      {isLoading && <Skeleton className="h-64 w-full max-w-lg" />}

      {location && (
        <div className="flex flex-wrap items-start gap-6">
          <Card className="w-full max-w-lg">
            <CardHeader>
              <CardTitle>{location.name}</CardTitle>
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
        <div className="flex flex-col gap-2">
          <Label htmlFor="loc-name">Name</Label>
          <Input id="loc-name" value={name} onChange={(e) => setName(e.target.value)} required />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="loc-address">Address</Label>
          <Input
            id="loc-address"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            required
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="loc-city">City</Label>
            <Input id="loc-city" value={city} onChange={(e) => setCity(e.target.value)} required />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="loc-state">State</Label>
            <Input
              id="loc-state"
              value={state}
              onChange={(e) => setState(e.target.value)}
              required
            />
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="loc-country">Country</Label>
          <Input
            id="loc-country"
            value={country}
            onChange={(e) => setCountry(e.target.value)}
            required
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="loc-tags">Tags</Label>
          <Input id="loc-tags" value={tags} onChange={(e) => setTags(e.target.value)} />
        </div>
      </CardContent>
      <CardFooter>
        <Button type="submit" disabled={updateLocation.isPending}>
          {updateLocation.isPending ? "Saving…" : "Save changes"}
        </Button>
      </CardFooter>
    </form>
  )
}
