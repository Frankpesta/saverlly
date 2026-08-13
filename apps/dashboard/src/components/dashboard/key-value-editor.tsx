"use client"

import * as React from "react"
import { PlusIcon, XIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

type Row = { id: string; key: string; value: string }

let rowIdCounter = 0
function newRowId() {
  rowIdCounter += 1
  return `row-${rowIdCounter}`
}

function rowsFromRecord(record: Record<string, string>): Row[] {
  const entries = Object.entries(record)
  return entries.length > 0
    ? entries.map(([key, value]) => ({ id: newRowId(), key, value }))
    : [{ id: newRowId(), key: "", value: "" }]
}

/** A minimal repeatable key/value row editor, for freeform Record<string,string> fields like credentials. */
export function KeyValueEditor({
  value,
  onChange,
}: {
  value: Record<string, string>
  onChange: (next: Record<string, string>) => void
}) {
  const [rows, setRows] = React.useState<Row[]>(() => rowsFromRecord(value))

  function emit(nextRows: Row[]) {
    setRows(nextRows)
    const record: Record<string, string> = {}
    for (const row of nextRows) {
      if (row.key.trim()) record[row.key.trim()] = row.value
    }
    onChange(record)
  }

  function updateRow(id: string, field: "key" | "value", next: string) {
    emit(rows.map((row) => (row.id === id ? { ...row, [field]: next } : row)))
  }

  function removeRow(id: string) {
    const next = rows.filter((row) => row.id !== id)
    emit(next.length > 0 ? next : [{ id: newRowId(), key: "", value: "" }])
  }

  function addRow() {
    setRows([...rows, { id: newRowId(), key: "", value: "" }])
  }

  return (
    <div className="flex flex-col gap-2">
      {rows.map((row) => (
        <div key={row.id} className="flex items-center gap-2">
          <Input
            placeholder="Key"
            value={row.key}
            onChange={(e) => updateRow(row.id, "key", e.target.value)}
          />
          <Input
            placeholder="Value"
            type="password"
            value={row.value}
            onChange={(e) => updateRow(row.id, "value", e.target.value)}
          />
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={() => removeRow(row.id)}
            aria-label="Remove row"
          >
            <XIcon className="size-4" />
          </Button>
        </div>
      ))}
      <Button type="button" variant="outline" size="sm" className="w-fit gap-1.5" onClick={addRow}>
        <PlusIcon className="size-4" />
        Add credential
      </Button>
    </div>
  )
}
