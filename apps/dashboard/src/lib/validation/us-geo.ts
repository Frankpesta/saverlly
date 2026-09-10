import usGeoData from "./us-geo-data.json"

/** 50 states + DC, generated from `zipcodes-us`'s GeoNames/USPS postal-code data — see
 * `scripts/generate-us-geo-data.mjs` (run via `npm run generate:us-geo` to refresh). Territories
 * and the Compact-of-Free-Association Pacific states are excluded there, matching the scope of
 * every US-only field in this app (Location.state, ZIP validation, etc.). */
export const US_STATES: { code: string; name: string }[] = usGeoData.states

/** Every US city from the same generator (~29,500 rows) — about 5x `typed-usa-states`'
 * ~5,800-city list this replaced, since USPS assigns ZIPs down to small unincorporated
 * communities, not just incorporated cities. */
export const US_CITIES: { city: string; state: string }[] = usGeoData.cities
