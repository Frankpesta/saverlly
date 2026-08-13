import {
  bucketByDay,
  buildDeviceKioskMap,
  deviceCounts,
  formatGrowthPct,
  monthOverMonthGrowth,
  sumByStatus,
  topByGroup,
} from "./aggregate"

describe("bucketByDay", () => {
  it("zero-fills every day in the window and sums matching values", () => {
    const today = new Date().toISOString().slice(0, 10)
    const items = [{ date: `${today}T10:00:00.000Z`, amount: 100 }, { date: `${today}T14:00:00.000Z`, amount: 50 }]

    const result = bucketByDay(items, (i) => i.date, (i) => i.amount, 3)

    expect(result).toHaveLength(3)
    expect(result[result.length - 1]).toEqual({ date: today, value: 150 })
    expect(result[0].value).toBe(0)
  })

  it("skips items with a null date", () => {
    const result = bucketByDay([{ date: null, amount: 999 }], (i) => i.date, (i) => i.amount, 1)
    expect(result[0].value).toBe(0)
  })
})

describe("sumByStatus", () => {
  it("zero-fills every declared status even when absent from items", () => {
    const items = [{ status: "CONFIRMED" as const, amount: 10 }, { status: "CONFIRMED" as const, amount: 5 }]
    const result = sumByStatus(items, (i) => i.status, (i) => i.amount, ["CONFIRMED", "PENDING", "REVERSED"] as const)
    expect(result).toEqual({ CONFIRMED: 15, PENDING: 0, REVERSED: 0 })
  })
})

describe("monthOverMonthGrowth", () => {
  it("returns null when last month has no data (avoids a meaningless % against zero)", () => {
    const now = new Date()
    const thisMonth = new Date(now.getFullYear(), now.getMonth(), 5).toISOString()
    const result = monthOverMonthGrowth([{ date: thisMonth, amount: 100 }], (i) => i.date, (i) => i.amount)
    expect(result).toBeNull()
  })

  it("computes percent change between this and last calendar month", () => {
    const now = new Date()
    const thisMonth = new Date(now.getFullYear(), now.getMonth(), 5).toISOString()
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 5).toISOString()
    const items = [
      { date: thisMonth, amount: 150 },
      { date: lastMonth, amount: 100 },
    ]
    const result = monthOverMonthGrowth(items, (i) => i.date, (i) => i.amount)
    expect(result).toBe(50)
  })
})

describe("formatGrowthPct", () => {
  it("formats positive and negative growth with a sign, and null as null", () => {
    expect(formatGrowthPct(12.4)).toBe("+12.4%")
    expect(formatGrowthPct(-3.25)).toBe("-3.3%")
    expect(formatGrowthPct(null)).toBeNull()
  })
})

describe("deviceCounts", () => {
  it("counts active vs disabled from the kill-switch boolean only", () => {
    const result = deviceCounts([{ active: true }, { active: true }, { active: false }])
    expect(result).toEqual({ total: 3, active: 2, disabled: 1 })
  })
})

describe("topByGroup", () => {
  it("sums by key, sorts descending, and caps at n", () => {
    const items = [
      { key: "a", amount: 10 },
      { key: "b", amount: 30 },
      { key: "a", amount: 5 },
      { key: "c", amount: 20 },
    ]
    const result = topByGroup(items, (i) => i.key, (i) => i.amount, 2)
    expect(result).toEqual([
      { key: "b", total: 30, count: 1 },
      { key: "c", total: 20, count: 1 },
    ])
  })
})

describe("buildDeviceKioskMap", () => {
  it("joins deviceId -> kioskId through each device's location", () => {
    const devices = [{ id: "d1", locationId: "l1" }, { id: "d2", locationId: "l2" }]
    const locations = [{ id: "l1", kioskId: "k1" }]
    const map = buildDeviceKioskMap(devices, locations)
    expect(map.get("d1")).toBe("k1")
    expect(map.has("d2")).toBe(false) // no matching location -> omitted, not fabricated
  })
})
