"use client"

type ErrorItem = { path: string; message: string; focus?: () => void }

function collectErrors(value: unknown, path = ""): ErrorItem[] {
  if (!value || typeof value !== "object") return []
  const error = value as { message?: unknown; ref?: { focus?: () => void } }
  if (typeof error.message === "string")
    return [{ path, message: error.message, focus: error.ref?.focus?.bind(error.ref) }]
  return Object.entries(value).flatMap(([key, child]) =>
    key === "ref" ? [] : collectErrors(child, path ? `${path}.${key}` : key),
  )
}

export function FormErrorSummary({ errors }: { errors: unknown }) {
  const items = collectErrors(errors)
  if (!items.length) return null
  return (
    <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-4">
      <p className="text-sm font-medium">Check the highlighted fields</p>
      <ul className="mt-2 space-y-1 text-sm">
        {items.map((item) => (
          <li key={item.path}>
            {item.focus ? (
              <button
                type="button"
                onClick={item.focus}
                className="text-left underline underline-offset-4"
              >
                {item.message}
              </button>
            ) : (
              item.message
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
