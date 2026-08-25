import * as React from "react"

/** Checkbox-based row selection for a table — tracks selected ids against whatever the
 *  currently-visible item set is, and drops any id that falls out of that set (a delete,
 *  a filter change, a page change) so selection never silently references a stale row. */
export function useTableSelection<T>(items: T[], getId: (item: T) => string) {
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set())

  React.useEffect(() => {
    setSelectedIds((prev) => {
      const validIds = new Set(items.map(getId))
      let changed = false
      const next = new Set<string>()
      for (const id of prev) {
        if (validIds.has(id)) next.add(id)
        else changed = true
      }
      return changed ? next : prev
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- getId is expected to be stable per call site
  }, [items])

  const allSelected = items.length > 0 && items.every((item) => selectedIds.has(getId(item)))
  const someSelected = selectedIds.size > 0 && !allSelected

  function toggle(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleAll() {
    setSelectedIds((prev) => {
      if (items.length > 0 && items.every((item) => prev.has(getId(item)))) return new Set()
      return new Set(items.map(getId))
    })
  }

  function clear() {
    setSelectedIds(new Set())
  }

  function deselectMany(ids: Iterable<string>) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      for (const id of ids) next.delete(id)
      return next
    })
  }

  return {
    selectedIds,
    isSelected: (id: string) => selectedIds.has(id),
    toggle,
    toggleAll,
    allSelected,
    someSelected,
    clear,
    deselectMany,
    selectedCount: selectedIds.size,
  }
}
