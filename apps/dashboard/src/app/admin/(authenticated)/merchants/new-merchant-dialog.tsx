"use client"

import * as React from "react"
import Link from "next/link"
import { toast } from "sonner"
import { PlusIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import { WizardStepDots } from "@/components/dashboard/wizard-step-dots"
import { useCreateMerchant } from "@/lib/api/hooks/use-merchants"
import { useAffiliatePrograms } from "@/lib/api/hooks/use-affiliate-programs"
import { useCreateScrapeSource } from "@/lib/api/hooks/use-scrape-sources"
import { ApiError } from "@/lib/api/client"
import { AttributionFields, type AttributionFieldsValue } from "./attribution-fields"

const STEPS = [
  { title: "Basic info", description: "Who is this store?" },
  { title: "Tracking method", description: "How do we earn commission from this store?" },
  { title: "Coupon sourcing", description: "Optional — how should coupon codes get in?" },
] as const

const EMPTY_TRACKING: AttributionFieldsValue = {
  attributionMethod: "COOKIE",
  affiliateTrackingUrl: "",
  affiliateUrlParamKey: "",
  affiliateUrlParamValue: "",
}

export function NewMerchantDialog() {
  const [open, setOpen] = React.useState(false)
  const [step, setStep] = React.useState(0)
  const [name, setName] = React.useState("")
  const [domain, setDomain] = React.useState("")
  const [tracking, setTracking] = React.useState<AttributionFieldsValue>(EMPTY_TRACKING)
  const [affiliateProgramId, setAffiliateProgramId] = React.useState<string>("")
  const [addScrapeSource, setAddScrapeSource] = React.useState(false)
  const [scrapeUrl, setScrapeUrl] = React.useState("")
  const [codeSelector, setCodeSelector] = React.useState("")
  const [descriptionSelector, setDescriptionSelector] = React.useState("")

  const createMerchant = useCreateMerchant()
  const createScrapeSource = useCreateScrapeSource()
  const { data: affiliatePrograms } = useAffiliatePrograms()

  function reset() {
    setStep(0)
    setName("")
    setDomain("")
    setTracking(EMPTY_TRACKING)
    setAffiliateProgramId("")
    setAddScrapeSource(false)
    setScrapeUrl("")
    setCodeSelector("")
    setDescriptionSelector("")
  }

  function handleOpenChange(next: boolean) {
    setOpen(next)
    if (!next) reset()
  }

  async function handleCreate(event: React.FormEvent) {
    event.preventDefault()
    createMerchant.mutate(
      {
        name,
        domain,
        attributionMethod: tracking.attributionMethod,
        affiliateTrackingUrl: tracking.affiliateTrackingUrl || undefined,
        affiliateUrlParamKey: tracking.affiliateUrlParamKey || undefined,
        affiliateUrlParamValue: tracking.affiliateUrlParamValue || undefined,
        affiliateProgramId: affiliateProgramId || undefined,
      },
      {
        onSuccess: async (merchant) => {
          if (addScrapeSource && scrapeUrl && codeSelector) {
            try {
              await createScrapeSource.mutateAsync({
                url: scrapeUrl,
                merchantId: merchant.id,
                selectorConfig: { codeSelector, descriptionSelector: descriptionSelector || undefined },
              })
            } catch (error) {
              toast.error(
                error instanceof ApiError
                  ? `Store created, but the scrape source failed: ${error.message}`
                  : "Store created, but the scrape source failed.",
              )
              handleOpenChange(false)
              return
            }
          }
          toast.success(`${name} was added.`)
          handleOpenChange(false)
        },
        onError: (error) =>
          toast.error(error instanceof ApiError ? error.message : "Could not add store."),
      },
    )
  }

  const canContinueStep2 =
    tracking.attributionMethod === "COOKIE"
      ? !!tracking.affiliateTrackingUrl
      : tracking.attributionMethod === "URL_PARAM"
        ? !!tracking.affiliateUrlParamKey && !!tracking.affiliateUrlParamValue
        : !!tracking.affiliateTrackingUrl && !!tracking.affiliateUrlParamKey && !!tracking.affiliateUrlParamValue

  const isPending = createMerchant.isPending || createScrapeSource.isPending

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <Button onClick={() => setOpen(true)} className="gap-1.5">
        <PlusIcon className="size-4" />
        Add Store
      </Button>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <WizardStepDots count={STEPS.length} current={step} />
          <DialogTitle>{STEPS[step].title}</DialogTitle>
          <DialogDescription>{STEPS[step].description}</DialogDescription>
        </DialogHeader>

        <form
          className="flex flex-1 flex-col justify-between overflow-y-auto"
          onSubmit={
            step < 2
              ? (e) => {
                  e.preventDefault()
                  setStep(step + 1)
                }
              : handleCreate
          }
        >
          <div className="flex flex-col gap-4 px-4">
            {step === 0 && (
              <>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="new-merchant-name">Name</Label>
                  <Input
                    id="new-merchant-name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="new-merchant-domain">Domain</Label>
                  <Input
                    id="new-merchant-domain"
                    placeholder="target.com"
                    value={domain}
                    onChange={(e) => setDomain(e.target.value)}
                    required
                  />
                </div>
              </>
            )}

            {step === 1 && (
              <AttributionFields idPrefix="new-merchant" value={tracking} onChange={setTracking} />
            )}

            {step === 2 && (
              <>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="new-merchant-program">Affiliate program (optional)</Label>
                  <Select value={affiliateProgramId} onValueChange={setAffiliateProgramId}>
                    <SelectTrigger id="new-merchant-program" className="w-full">
                      <SelectValue placeholder="None" />
                    </SelectTrigger>
                    <SelectContent>
                      {affiliatePrograms?.map((program) => (
                        <SelectItem key={program.id} value={program.id}>
                          {program.networkName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Link
                    href="/admin/affiliate-programs"
                    className="text-sm text-muted-foreground hover:underline"
                  >
                    Manage affiliate programs →
                  </Link>
                </div>

                <div className="flex items-center justify-between rounded-xl border border-black/8 p-3">
                  <div>
                    <Label htmlFor="new-merchant-add-scrape">Add a scrape source now</Label>
                    <p className="text-sm text-muted-foreground">
                      You can also add this later from Scrape Sources.
                    </p>
                  </div>
                  <Switch
                    id="new-merchant-add-scrape"
                    checked={addScrapeSource}
                    onCheckedChange={setAddScrapeSource}
                  />
                </div>

                {addScrapeSource && (
                  <>
                    <div className="flex flex-col gap-2">
                      <Label htmlFor="new-merchant-scrape-url">Page URL</Label>
                      <Input
                        id="new-merchant-scrape-url"
                        type="url"
                        placeholder="https://…"
                        value={scrapeUrl}
                        onChange={(e) => setScrapeUrl(e.target.value)}
                        required={addScrapeSource}
                      />
                    </div>
                    <div className="flex flex-col gap-2">
                      <Label htmlFor="new-merchant-code-selector">Coupon code selector</Label>
                      <Input
                        id="new-merchant-code-selector"
                        placeholder=".coupon-code"
                        value={codeSelector}
                        onChange={(e) => setCodeSelector(e.target.value)}
                        required={addScrapeSource}
                      />
                    </div>
                    <div className="flex flex-col gap-2">
                      <Label htmlFor="new-merchant-description-selector">
                        Description selector (optional)
                      </Label>
                      <Input
                        id="new-merchant-description-selector"
                        value={descriptionSelector}
                        onChange={(e) => setDescriptionSelector(e.target.value)}
                      />
                    </div>
                  </>
                )}
              </>
            )}
          </div>

          <DialogFooter className="flex-row justify-end">
            {step > 0 && (
              <Button type="button" variant="outline" onClick={() => setStep(step - 1)}>
                Back
              </Button>
            )}
            <Button type="submit" disabled={(step === 1 && !canContinueStep2) || isPending}>
              {step < 2 ? "Continue" : isPending ? "Adding…" : "Add store"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
