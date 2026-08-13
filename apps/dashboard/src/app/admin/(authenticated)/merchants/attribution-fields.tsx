"use client"

import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { AttributionMethod } from "@/lib/api/types"

export type AttributionFieldsValue = {
  attributionMethod: AttributionMethod
  affiliateTrackingUrl: string
  affiliateUrlParamKey: string
  affiliateUrlParamValue: string
}

const METHOD_LABEL: Record<AttributionMethod, string> = {
  COOKIE: "Cookie",
  URL_PARAM: "URL parameter",
  BOTH: "Both",
}

/**
 * Tracking-method fields shared by the "Add store" wizard and the merchant edit form. Which
 * fields are required mirrors the backend's own validation exactly (merchants.service.ts
 * assertTrackingFieldsPresent): trackingUrl for COOKIE/BOTH, paramKey+paramValue for URL_PARAM/BOTH.
 */
export function AttributionFields({
  value,
  onChange,
  idPrefix,
}: {
  value: AttributionFieldsValue
  onChange: (next: AttributionFieldsValue) => void
  idPrefix: string
}) {
  const needsTrackingUrl = value.attributionMethod === "COOKIE" || value.attributionMethod === "BOTH"
  const needsUrlParam = value.attributionMethod === "URL_PARAM" || value.attributionMethod === "BOTH"

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor={`${idPrefix}-method`}>Tracking method</Label>
        <Select
          value={value.attributionMethod}
          onValueChange={(v) => onChange({ ...value, attributionMethod: v as AttributionMethod })}
        >
          <SelectTrigger id={`${idPrefix}-method`} className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(METHOD_LABEL) as AttributionMethod[]).map((method) => (
              <SelectItem key={method} value={method}>
                {METHOD_LABEL[method]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {needsTrackingUrl && (
        <div className="flex flex-col gap-2">
          <Label htmlFor={`${idPrefix}-tracking-url`}>Affiliate tracking URL</Label>
          <Input
            id={`${idPrefix}-tracking-url`}
            type="url"
            placeholder="https://…"
            value={value.affiliateTrackingUrl}
            onChange={(e) => onChange({ ...value, affiliateTrackingUrl: e.target.value })}
            required
          />
          <p className="text-sm text-muted-foreground">Sets the tracking cookie on visit.</p>
        </div>
      )}

      {needsUrlParam && (
        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor={`${idPrefix}-param-key`}>URL param key</Label>
            <Input
              id={`${idPrefix}-param-key`}
              placeholder="irclickid"
              value={value.affiliateUrlParamKey}
              onChange={(e) => onChange({ ...value, affiliateUrlParamKey: e.target.value })}
              required
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor={`${idPrefix}-param-value`}>Platform&apos;s tracking ID</Label>
            <Input
              id={`${idPrefix}-param-value`}
              value={value.affiliateUrlParamValue}
              onChange={(e) => onChange({ ...value, affiliateUrlParamValue: e.target.value })}
              required
            />
          </div>
        </div>
      )}
    </div>
  )
}
