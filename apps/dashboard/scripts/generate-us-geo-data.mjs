// Regenerates src/lib/validation/us-geo-data.json from zipcodes-us's bundled GeoNames/USPS
// postal-code file. Run with `npm run generate:us-geo` whenever a newer zipcodes-us release
// ships updated place data — this does not run as part of the normal build.
//
// zipcodes-us is a devDependency purely to feed this script; nothing at runtime imports it
// directly (its full dataset + multi-format bundle is far larger than the app needs), so this
// script distills it down to the {city, state}/{name, code} pairs us-geo.ts actually uses.
import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { createRequire } from "node:module"
import { join } from "node:path"
import { fileURLToPath } from "node:url"

const require = createRequire(import.meta.url)
// zipcodes-us's package.json "exports" only maps the package root ("."), so neither a deep
// subpath nor even "./package.json" resolves directly. `resolve.paths` returns the node_modules
// search path without going through exports resolution, so find the package there instead.
const packageRoot = require.resolve
  .paths("zipcodes-us")
  .map((dir) => join(dir, "zipcodes-us"))
  .find((dir) => existsSync(dir))
if (!packageRoot) throw new Error("Could not locate the zipcodes-us package on disk")
const dataPath = join(packageRoot, "data", "US.txt")

// US territories, plus the freely-associated Pacific states that share USPS ZIP ranges (Compact
// of Free Association), carry entries in this file too, but every US-only field in this app
// (Location.state, ZIP validation, etc.) is deliberately scoped to the 50 states + DC.
const TERRITORY_CODES = new Set(["AS", "GU", "MP", "PR", "VI", "FM", "MH", "PW"])

const rows = readFileSync(dataPath, "utf8").trim().split("\n")

const states = new Map()
const cities = new Set()

for (const row of rows) {
  // GeoNames postal-code format: country, postal_code, place_name, admin_name1 (state),
  // admin_code1 (state abbrev), admin_name2 (county), admin_code2, admin_name3, admin_code3,
  // latitude, longitude, accuracy.
  const columns = row.split("\t")
  const city = columns[2]
  const stateName = columns[3]
  const stateCode = columns[4]
  if (!city || !stateName || !stateCode || TERRITORY_CODES.has(stateCode)) continue

  states.set(stateCode, stateName)
  cities.add(JSON.stringify({ city, state: stateCode }))
}

const US_STATES = Array.from(states, ([code, name]) => ({ code, name })).sort((a, b) =>
  a.name.localeCompare(b.name),
)
const US_CITIES = Array.from(cities, (entry) => JSON.parse(entry)).sort(
  (a, b) => a.city.localeCompare(b.city) || a.state.localeCompare(b.state),
)

const outPath = fileURLToPath(new URL("../src/lib/validation/us-geo-data.json", import.meta.url))
writeFileSync(outPath, JSON.stringify({ states: US_STATES, cities: US_CITIES }))

console.log(`Wrote ${US_STATES.length} states and ${US_CITIES.length} city+state pairs to ${outPath}`)
