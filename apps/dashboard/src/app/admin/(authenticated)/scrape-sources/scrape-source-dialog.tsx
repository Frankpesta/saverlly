"use client"

import * as React from "react"
import { toast } from "sonner"
import { PencilIcon, PlusIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
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
import { useCreateScrapeSource, useUpdateScrapeSource } from "@/lib/api/hooks/use-scrape-sources"
import { ApiError } from "@/lib/api/client"
import type { Merchant, ScrapeSource } from "@/lib/api/types"

/**
 * Create-or-edit scrape source dialog. Pass `merchantId` when used inside a merchant's own page
 * (locks the merchant, hides the picker); pass `merchants` for the cross-merchant list, where the
 * picker is optional (a source can cover multiple/no merchants yet). Pass `source` to edit.
 */
export function ScrapeSourceDialog({
  merchantId,
  merchants,
  source,
}: {
  merchantId?: string
  merchants?: Merchant[]
  source?: ScrapeSource
}) {
  const isEdit = !!source
  const [open, setOpen] = React.useState(false)
  const [selectedMerchantId, setSelectedMerchantId] = React.useState(
    merchantId ?? source?.merchantId ?? "",
  )
  const [url, setUrl] = React.useState(source?.url ?? "")
  const [codeSelector, setCodeSelector] = React.useState(source?.selectorConfig.codeSelector ?? "")
  const [descriptionSelector, setDescriptionSelector] = React.useState(
    source?.selectorConfig.descriptionSelector ?? "",
  )
  const [intervalMinutes, setIntervalMinutes] = React.useState(
    String(source?.intervalMinutes ?? 1440),
  )

  const createSource = useCreateScrapeSource()
  const updateSource = useUpdateScrapeSource(source?.id ?? "")
  const isPending = createSource.isPending || updateSource.isPending

  function reset() {
    setSelectedMerchantId(merchantId ?? "")
    setUrl("")
    setCodeSelector("")
    setDescriptionSelector("")
    setIntervalMinutes("1440")
  }

  function handleOpenChange(next: boolean) {
    setOpen(next)
    if (!next && !isEdit) reset()
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    const shared = {
      url,
      merchantId: selectedMerchantId || undefined,
      selectorConfig: { codeSelector, descriptionSelector: descriptionSelector || undefined },
      intervalMinutes: Number(intervalMinutes),
    }

    if (isEdit) {
      updateSource.mutate(shared, {
        onSuccess: () => {
          toast.success("Scrape source updated.")
          handleOpenChange(false)
        },
        onError: (error) =>
          toast.error(error instanceof ApiError ? error.message : "Could not update scrape source."),
      })
    } else {
      createSource.mutate(shared, {
        onSuccess: () => {
          toast.success("Scrape source added.")
          handleOpenChange(false)
        },
        onError: (error) =>
          toast.error(error instanceof ApiError ? error.message : "Could not add scrape source."),
      })
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      {isEdit ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex items-center gap-1 text-sm text-muted-foreground hover:underline"
        >
          <PencilIcon className="size-3.5" />
          Edit
        </button>
      ) : (
        <Button onClick={() => setOpen(true)} size="sm" className="gap-1.5">
          <PlusIcon className="size-4" />
          New Scrape Source
        </Button>
      )}
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit scrape source" : "New scrape source"}</DialogTitle>
          <DialogDescription>
            A page URL plus CSS selectors the scraper uses to extract coupon codes.
          </DialogDescription>
        </DialogHeader>

        <form className="flex flex-1 flex-col justify-between" onSubmit={handleSubmit}>
          <div className="flex flex-col gap-4 px-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="scrape-url">Page URL</Label>
              <Input
                id="scrape-url"
                type="url"
                placeholder="https://…"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                required
              />
            </div>
            {!merchantId && (
              <div className="flex flex-col gap-2">
                <Label htmlFor="scrape-merchant">Merchant (optional)</Label>
                <Select value={selectedMerchantId} onValueChange={setSelectedMerchantId}>
                  <SelectTrigger id="scrape-merchant" className="w-full">
                    <SelectValue placeholder="Not yet attributed to one merchant" />
                  </SelectTrigger>
                  <SelectContent>
                    {merchants?.map((merchant) => (
                      <SelectItem key={merchant.id} value={merchant.id}>
                        {merchant.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="flex flex-col gap-2">
              <Label htmlFor="scrape-code-selector">Coupon code selector</Label>
              <Input
                id="scrape-code-selector"
                placeholder=".coupon-code"
                value={codeSelector}
                onChange={(e) => setCodeSelector(e.target.value)}
                required
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="scrape-description-selector">Description selector (optional)</Label>
              <Input
                id="scrape-description-selector"
                value={descriptionSelector}
                onChange={(e) => setDescriptionSelector(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="scrape-interval">Scrape every (minutes)</Label>
              <Input
                id="scrape-interval"
                type="number"
                min="1"
                value={intervalMinutes}
                onChange={(e) => setIntervalMinutes(e.target.value)}
                required
              />
              <p className="text-sm text-muted-foreground">Defaults to daily (1440 minutes).</p>
            </div>
          </div>

          <DialogFooter>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Saving…" : isEdit ? "Save changes" : "Add scrape source"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
