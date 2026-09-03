"use client"

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message)
  }
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api/proxy${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init?.headers,
    },
  })

  if (!res.ok) {
    let message = `Request failed with status ${res.status}`
    try {
      const body = await res.json()
      if (typeof body?.message === "string") message = body.message
      else if (Array.isArray(body?.message)) message = body.message.join(", ")
    } catch {
      // response wasn't JSON, keep the default message
    }
    throw new ApiError(message, res.status)
  }

  if (res.status === 204) return undefined as T
  return res.json()
}

export async function apiUpload<T>(path: string, file: File): Promise<T> {
  const formData = new FormData()
  formData.append("file", file)

  // No explicit Content-Type. The browser sets multipart/form-data with the right boundary itself.
  const res = await fetch(`/api/proxy${path}`, {
    method: "POST",
    body: formData,
  })

  if (!res.ok) {
    let message = `Request failed with status ${res.status}`
    try {
      const body = await res.json()
      if (typeof body?.message === "string") message = body.message
      else if (Array.isArray(body?.message)) message = body.message.join(", ")
    } catch {
      // response wasn't JSON, keep the default message
    }
    throw new ApiError(message, res.status)
  }

  return res.json()
}
