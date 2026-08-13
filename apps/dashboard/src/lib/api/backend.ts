import "server-only"

const BACKEND_API_URL = process.env.BACKEND_API_URL ?? "http://localhost:3000"

export function backendUrl(path: string): string {
  return `${BACKEND_API_URL}${path.startsWith("/") ? path : `/${path}`}`
}

export async function backendFetch(path: string, init?: RequestInit): Promise<Response> {
  return fetch(backendUrl(path), {
    ...init,
    cache: "no-store",
  })
}
