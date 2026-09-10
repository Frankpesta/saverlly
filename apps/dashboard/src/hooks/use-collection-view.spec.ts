import { act, renderHook } from "@testing-library/react"
import { useCollectionView } from "./use-collection-view"
import { usePagination } from "./use-pagination"

const records = Array.from({ length: 60 }, (_, index) => ({
  name: `Device ${index + 1}`,
  active: index % 2 === 0,
}))

function useDirectory() {
  const view = useCollectionView(records, {
    searchText: (item) => item.name,
    sorts: [
      {
        label: "Name",
        value: "name",
        compare: (a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }),
      },
    ],
    filters: [
      {
        key: "status",
        label: "Status",
        options: [
          { label: "Active", value: "active", matches: (item) => item.active },
          { label: "Inactive", value: "inactive", matches: (item) => !item.active },
        ],
      },
    ],
  })
  return { view, pagination: usePagination(view.items, 25, view.resetKey) }
}

beforeEach(() => {
  jest.useFakeTimers()
})

afterEach(() => {
  jest.useRealTimers()
})

it("searches the entire collection before pagination without mutating the source, after the debounce settles", () => {
  const original = [...records]
  const { result } = renderHook(useDirectory)
  act(() => result.current.view.setQuery("  DEVICE 60  "))
  act(() => jest.advanceTimersByTime(250))
  expect(result.current.pagination.pageItems).toEqual([records[59]])
  expect(records).toEqual(original)
})

it("returns to the first page when a new filter has the same number of matches", () => {
  const { result } = renderHook(useDirectory)
  act(() => result.current.view.setFilterValue("status", "active"))
  act(() => result.current.pagination.setPage(2))
  expect(result.current.pagination.page).toBe(2)
  act(() => result.current.view.setFilterValue("status", "inactive"))
  expect(result.current.pagination.totalItems).toBe(30)
  expect(result.current.pagination.page).toBe(1)
  expect(result.current.pagination.pageItems[0].name).toBe("Device 2")
})
