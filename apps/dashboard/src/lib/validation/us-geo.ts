import { usaCities, usaStates } from "typed-usa-states"

/** 50 states + DC. Territories (American Samoa, Guam, Northern Mariana Islands, Puerto Rico,
 * US Virgin Islands) are excluded, matching the scope of every US-only field in this app
 * (Location.state, ZIP validation, etc.). */
export const US_STATES: { code: string; name: string }[] = usaStates
  .filter((state) => !state.territory)
  .map((state) => ({ code: state.abbreviation, name: state.name }))

/** `typed-usa-states` stores each city's state as a full name ("California"), but every state
 * field in this app is the 2-letter code ("CA"). This is the lookup that bridges the two. */
const STATE_NAME_TO_CODE = new Map(US_STATES.map((state) => [state.name, state.code]))

/** Every US city from `typed-usa-states` (~5,800 rows), with state normalized to its 2-letter
 * code. Cities in a filtered-out territory are dropped along with it. */
export const US_CITIES: { city: string; state: string }[] = usaCities
  .map((city) => ({ city: city.name, state: STATE_NAME_TO_CODE.get(city.state) }))
  .filter((city): city is { city: string; state: string } => city.state !== undefined)
