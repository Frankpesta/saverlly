import { act, renderHook } from "@testing-library/react"
import { useTableSelection } from "./use-table-selection"

type Item = { id: string }

function makeItems(ids: string[]): Item[] {
  return ids.map((id) => ({ id }))
}

describe("useTableSelection", () => {
  it("toggles individual rows in and out of the selection", () => {
    const { result } = renderHook(() => useTableSelection(makeItems(["a", "b", "c"]), (i) => i.id))

    act(() => result.current.toggle("b"))
    expect(result.current.isSelected("b")).toBe(true)
    expect(result.current.selectedCount).toBe(1)

    act(() => result.current.toggle("b"))
    expect(result.current.isSelected("b")).toBe(false)
    expect(result.current.selectedCount).toBe(0)
  })

  it("toggleAll selects every item, then clears on a second call", () => {
    const { result } = renderHook(() => useTableSelection(makeItems(["a", "b", "c"]), (i) => i.id))

    act(() => result.current.toggleAll())
    expect(result.current.allSelected).toBe(true)
    expect(result.current.selectedCount).toBe(3)

    act(() => result.current.toggleAll())
    expect(result.current.allSelected).toBe(false)
    expect(result.current.selectedCount).toBe(0)
  })

  it("reports someSelected only for a partial selection, never alongside allSelected", () => {
    const { result } = renderHook(() => useTableSelection(makeItems(["a", "b", "c"]), (i) => i.id))

    act(() => result.current.toggle("a"))
    expect(result.current.someSelected).toBe(true)
    expect(result.current.allSelected).toBe(false)

    act(() => {
      result.current.toggle("b")
      result.current.toggle("c")
    })
    expect(result.current.allSelected).toBe(true)
    expect(result.current.someSelected).toBe(false)
  })

  it("drops a selected id once its row disappears from the item set (e.g. deleted or filtered out)", () => {
    const { result, rerender } = renderHook(({ items }) => useTableSelection(items, (i) => i.id), {
      initialProps: { items: makeItems(["a", "b", "c"]) },
    })

    act(() => {
      result.current.toggle("a")
      result.current.toggle("b")
    })
    expect(result.current.selectedCount).toBe(2)

    rerender({ items: makeItems(["b", "c"]) }) // "a" is gone

    expect(result.current.isSelected("a")).toBe(false)
    expect(result.current.isSelected("b")).toBe(true)
    expect(result.current.selectedCount).toBe(1)
  })

  it("clear empties the selection", () => {
    const { result } = renderHook(() => useTableSelection(makeItems(["a", "b"]), (i) => i.id))

    act(() => result.current.toggleAll())
    expect(result.current.selectedCount).toBe(2)

    act(() => result.current.clear())
    expect(result.current.selectedCount).toBe(0)
  })
})
