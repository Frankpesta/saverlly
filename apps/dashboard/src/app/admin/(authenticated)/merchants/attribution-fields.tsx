"use client"

import { Input } from "@/components/ui/input"
import {
  Combobox,
} from "@/components/ui/combobox"
import { FormField, FormGrid } from "@/components/dashboard/form-section"
import type { AttributionMethod } from "@/lib/api/types"

export type AttributionFieldsValue = {
  attributionMethod: AttributionMethod
  affiliateTrackingUrl?: string
  affiliateUrlParamKey?: string
  affiliateUrlParamValue?: string
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
export type AttributionFieldsErrors = Partial<Record<keyof AttributionFieldsValue, string>>

export function AttributionFields({
  value,
  onChange,
  idPrefix,
  errors,
}: {
  value: AttributionFieldsValue
  onChange: (next: AttributionFieldsValue) => void
  idPrefix: string
  errors?: AttributionFieldsErrors
}) {
  const needsTrackingUrl = value.attributionMethod === "COOKIE" || value.attributionMethod === "BOTH"
  const needsUrlParam = value.attributionMethod === "URL_PARAM" || value.attributionMethod === "BOTH"

  return (
    <div className="flex flex-col gap-4">
      <FormField label="Tracking method" htmlFor={`${idPrefix}-method`}>
        <Combobox
          id={`${idPrefix}-method`}
          value={value.attributionMethod}
          onValueChange={(v) => onChange({ ...value, attributionMethod: v as AttributionMethod })}
          options={(Object.keys(METHOD_LABEL) as AttributionMethod[]).map((method) => ({
            value: method,
            label: METHOD_LABEL[method],
          }))}
        />
      </FormField>

      {needsTrackingUrl && (
        <FormField
          label="Affiliate tracking URL"
          htmlFor={`${idPrefix}-tracking-url`}
          hint="Sets the tracking cookie on visit."
          error={errors?.affiliateTrackingUrl}
        >
          <Input
            id={`${idPrefix}-tracking-url`}
            type="url"
            placeholder="https://…"
            value={value.affiliateTrackingUrl}
            onChange={(e) => onChange({ ...value, affiliateTrackingUrl: e.target.value })}
            aria-invalid={!!errors?.affiliateTrackingUrl}
          />
        </FormField>
      )}

      {needsUrlParam && (
        <FormGrid>
          <FormField label="URL param key" htmlFor={`${idPrefix}-param-key`} error={errors?.affiliateUrlParamKey}>
            <Input
              id={`${idPrefix}-param-key`}
              placeholder="irclickid"
              value={value.affiliateUrlParamKey}
              onChange={(e) => onChange({ ...value, affiliateUrlParamKey: e.target.value })}
              aria-invalid={!!errors?.affiliateUrlParamKey}
            />
          </FormField>
          <FormField
            label="Platform's tracking ID"
            htmlFor={`${idPrefix}-param-value`}
            error={errors?.affiliateUrlParamValue}
          >
            <Input
              id={`${idPrefix}-param-value`}
              value={value.affiliateUrlParamValue}
              onChange={(e) => onChange({ ...value, affiliateUrlParamValue: e.target.value })}
              aria-invalid={!!errors?.affiliateUrlParamValue}
            />
          </FormField>
        </FormGrid>
      )}
    </div>
  )
}
