import { act, renderHook } from "@testing-library/react"
import { usePagination } from "./use-pagination"

function makeItems(count: number) {
  return Array.from({ length: count }, (_, i) => i)
}

describe("usePagination", () => {
  it("returns all items on page 1 when the list fits within one page", () => {
    const { result } = renderHook(() => usePagination(makeItems(10), 25))

    expect(result.current.page).toBe(1)
    expect(result.current.pageCount).toBe(1)
    expect(result.current.pageItems).toHaveLength(10)
    expect(result.current.totalItems).toBe(10)
  })

  it("splits a list larger than the page size into multiple pages", () => {
    const { result } = renderHook(() => usePagination(makeItems(30), 25))

    expect(result.current.pageCount).toBe(2)
    expect(result.current.pageItems).toHaveLength(25)
    expect(result.current.pageItems[0]).toBe(0)
    expect(result.current.pageItems[24]).toBe(24)
  })

  it("advances to page 2 and returns the remaining items", () => {
    const { result } = renderHook(() => usePagination(makeItems(30), 25))

    act(() => result.current.setPage(2))

    expect(result.current.page).toBe(2)
    expect(result.current.pageItems).toHaveLength(5)
    expect(result.current.pageItems[0]).toBe(25)
  })

  it("resets to page 1 when the item count changes (e.g. a filter narrows the results)", () => {
    const { result, rerender } = renderHook(({ items }) => usePagination(items, 25), {
      initialProps: { items: makeItems(30) },
    })

    act(() => result.current.setPage(2))
    expect(result.current.page).toBe(2)

    rerender({ items: makeItems(5) })

    expect(result.current.page).toBe(1)
    expect(result.current.pageItems).toHaveLength(5)
  })

  it("handles an undefined items array as empty", () => {
    const { result } = renderHook(() => usePagination(undefined, 25))

    expect(result.current.totalItems).toBe(0)
    expect(result.current.pageCount).toBe(1)
    expect(result.current.pageItems).toEqual([])
  })
})
