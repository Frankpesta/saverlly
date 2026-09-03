"use client"

import { useParams } from "next/navigation"
import { Skeleton } from "@/components/ui/skeleton"
import { useAffiliatePrograms } from "@/lib/api/hooks/use-affiliate-programs"
import { AffiliateProgramForm } from "../affiliate-program-form"

export default function EditAffiliateProgramPage() {
  const { id } = useParams<{ id: string }>()
  const { data: programs, isLoading, isError } = useAffiliatePrograms()

  // There is no single-program endpoint, so the row comes out of the list.
  const program = programs?.find((p) => p.id === id)

  if (isError) {
    return <p className="text-sm text-destructive">Could not load this affiliate program.</p>
  }

  if (isLoading || !program) {
    return (
      <div className="flex flex-col gap-6">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-80 w-full max-w-2xl" />
      </div>
    )
  }

  // react-hook-form only reads defaultValues on mount, so a different program loading into the
  // same route needs a remount to show its own values.
  return <AffiliateProgramForm key={program.id} program={program} />
}
