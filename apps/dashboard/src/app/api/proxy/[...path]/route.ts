import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { cookies } from "next/headers"
import { backendUrl } from "@/lib/api/backend"
import { ACCESS_TOKEN_COOKIE } from "@/lib/auth/constants"
import { refreshSession } from "@/lib/auth/session"

async function forward(request: NextRequest, path: string[], token: string | undefined) {
  const targetPath = `/${path.join("/")}${request.nextUrl.search}`
  const hasBody = request.method !== "GET" && request.method !== "HEAD"

  return fetch(backendUrl(targetPath), {
    method: request.method,
    headers: {
      "Content-Type": request.headers.get("content-type") ?? "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    // arrayBuffer, not text(), a multipart/form-data upload's binary bytes and boundary would
    // otherwise get corrupted by a UTF-8 text round-trip. A no-op for the existing JSON traffic.
    body: hasBody ? await request.clone().arrayBuffer() : undefined,
    cache: "no-store",
  })
}

async function handle(
  request: NextRequest,
  ctx: RouteContext<"/api/proxy/[...path]">,
) {
  const { path } = await ctx.params
  const cookieStore = await cookies()
  const accessToken = cookieStore.get(ACCESS_TOKEN_COOKIE)?.value

  let response = await forward(request, path, accessToken)

  if (response.status === 401) {
    const newToken = await refreshSession()
    if (newToken) {
      response = await forward(request, path, newToken)
    }
  }

  // The Fetch spec forbids a body on null-body statuses (204/205/304). Even a zero-length
  // ArrayBuffer counts as "has a body" and makes the Response constructor throw, turning a
  // successful backend delete (204) into a 500 here while the deletion already happened.
  const isNullBodyStatus = response.status === 204 || response.status === 205 || response.status === 304

  const headers = new Headers({
    "Content-Type": response.headers.get("content-type") ?? "application/json",
  })
  // Carried through so a file response stays a file response. Without Content-Disposition the
  // agent installer would arrive named after the route rather than SaverllyAgentSetup.exe, and
  // without Content-Length the browser can't show download progress.
  for (const header of ["content-disposition", "content-length"]) {
    const value = response.headers.get(header)
    if (value) headers.set(header, value)
  }

  // Streamed rather than buffered: the agent installer is ~32MB, and holding it whole in memory
  // per request is needless. Transparent for the JSON traffic that makes up everything else.
  return new NextResponse(isNullBodyStatus ? null : response.body, {
    status: response.status,
    headers,
  })
}

export {
  handle as GET,
  handle as POST,
  handle as PATCH,
  handle as PUT,
  handle as DELETE,
}
