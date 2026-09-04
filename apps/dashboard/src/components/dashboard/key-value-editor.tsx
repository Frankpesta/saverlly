"use client"

import * as React from "react"
import { PlusIcon, XIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { PasswordInput } from "@/components/ui/password-input"
import { AutofillDecoy, useAutofillReadOnly } from "@/components/dashboard/autofill-guard"

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

/** A minimal repeatable key/value row editor, for freeform Record<string,string> fields like
 * credentials.
 *
 * The value input needs active protection from Chrome's autofill. It is a masked field sitting
 * next to a plain text field inside a form, which Chrome's heuristics read as a login form, so
 * it was being pre-filled with the user's own saved Saverlly password. The client reported this
 * as "why is the Value field filled out by default?" on the affiliate program form. There is no
 * code-level default; the browser was putting it there. */
export function KeyValueEditor({
  value,
  onChange,
}: {
  value: Record<string, string>
  onChange: (next: Record<string, string>) => void
}) {
  const [rows, setRows] = React.useState<Row[]>(() => rowsFromRecord(value))
  // Per-instance suffix so the field names are not the generic "value" that autofill matches on.
  const nameSuffix = React.useId().replace(/:/g, "")

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
    <div className="relative flex flex-col gap-2">
      {/* Absorbs the saved-credential autofill so it never reaches the rows below. */}
      <AutofillDecoy />
      {rows.map((row) => (
        <CredentialRow
          key={row.id}
          row={row}
          nameSuffix={nameSuffix}
          onUpdate={updateRow}
          onRemove={removeRow}
        />
      ))}
      <Button type="button" variant="outline" size="sm" className="w-fit gap-1.5" onClick={addRow}>
        <PlusIcon className="size-4" />
        Add credential
      </Button>
    </div>
  )
}

function CredentialRow({
  row,
  nameSuffix,
  onUpdate,
  onRemove,
}: {
  row: Row
  nameSuffix: string
  onUpdate: (id: string, field: "key" | "value", next: string) => void
  onRemove: (id: string) => void
}) {
  const autofillGuard = useAutofillReadOnly()

  return (
    <div className="flex items-center gap-2">
      <Input
        placeholder="Key"
        autoComplete="off"
        name={`credential-key-${nameSuffix}-${row.id}`}
        data-1p-ignore
        value={row.key}
        onChange={(e) => onUpdate(row.id, "key", e.target.value)}
        className="min-w-0 flex-1"
      />
      {/* PasswordInput's own wrapper div is what's actually laid out as the flex item here, so
          the flex-basis has to go on this div, not on the className it forwards to the inner
          <input>, otherwise this field stays sized to its content and reads narrower than Key. */}
      <div className="min-w-0 flex-1">
        <PasswordInput
          placeholder="Value"
          autoComplete="off"
          name={`credential-value-${nameSuffix}-${row.id}`}
          data-1p-ignore
          data-lpignore="true"
          value={row.value}
          onChange={(e) => onUpdate(row.id, "value", e.target.value)}
          {...autofillGuard}
        />
      </div>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        onClick={() => onRemove(row.id)}
        aria-label="Remove row"
      >
        <XIcon className="size-4" />
      </Button>
    </div>
  )
}
