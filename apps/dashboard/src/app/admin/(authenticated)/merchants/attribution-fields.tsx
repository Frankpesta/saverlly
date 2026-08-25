"use client"

import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { FormField, FormGrid } from "@/components/dashboard/form-section"
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
      <FormField label="Tracking method" htmlFor={`${idPrefix}-method`}>
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
      </FormField>

      {needsTrackingUrl && (
        <FormField
          label="Affiliate tracking URL"
          htmlFor={`${idPrefix}-tracking-url`}
          hint="Sets the tracking cookie on visit."
        >
          <Input
            id={`${idPrefix}-tracking-url`}
            type="url"
            placeholder="https://…"
            value={value.affiliateTrackingUrl}
            onChange={(e) => onChange({ ...value, affiliateTrackingUrl: e.target.value })}
            required
          />
        </FormField>
      )}

      {needsUrlParam && (
        <FormGrid>
          <FormField label="URL param key" htmlFor={`${idPrefix}-param-key`}>
            <Input
              id={`${idPrefix}-param-key`}
              placeholder="irclickid"
              value={value.affiliateUrlParamKey}
              onChange={(e) => onChange({ ...value, affiliateUrlParamKey: e.target.value })}
              required
            />
          </FormField>
          <FormField label="Platform's tracking ID" htmlFor={`${idPrefix}-param-value`}>
            <Input
              id={`${idPrefix}-param-value`}
              value={value.affiliateUrlParamValue}
              onChange={(e) => onChange({ ...value, affiliateUrlParamValue: e.target.value })}
              required
            />
          </FormField>
        </FormGrid>
      )}
    </div>
  )
}
