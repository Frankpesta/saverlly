import "server-only"
import { lookup } from "node:dns/promises"
import { isIPv4 } from "node:net"

/**
 * Blocks server-side requests to private/loopback/link-local/reserved addresses -- including
 * cloud metadata endpoints (169.254.169.254) -- so a route that fetches a user-supplied URL
 * (e.g. the announcement image proxy) can't be used to probe or reach internal-only services.
 * Resolves the hostname first and checks the *resolved* address, not just the literal
 * hostname string, so a DNS name that merely points at a private IP is still caught.
 */

function isPrivateIPv4(ip: string): boolean {
  const parts = ip.split(".").map(Number)
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) return true
  const [a, b] = parts
  if (a === 0) return true // 0.0.0.0/8
  if (a === 10) return true // RFC1918
  if (a === 127) return true // loopback
  if (a === 100 && b >= 64 && b <= 127) return true // CGNAT 100.64.0.0/10
  if (a === 169 && b === 254) return true // link-local incl. cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return true // RFC1918
  if (a === 192 && b === 0 && parts[2] === 0) return true // 192.0.0.0/24
  if (a === 192 && b === 0 && parts[2] === 2) return true // TEST-NET-1
  if (a === 192 && b === 168) return true // RFC1918
  if (a === 198 && (b === 18 || b === 19)) return true // benchmarking 198.18.0.0/15
  if (a === 198 && b === 51 && parts[2] === 100) return true // TEST-NET-2
  if (a === 203 && b === 0 && parts[2] === 113) return true // TEST-NET-3
  if (a >= 224) return true // multicast (224-239) + reserved (240-255)
  return false
}

function isPrivateIPv6(ip: string): boolean {
  const normalized = ip.toLowerCase()
  if (normalized === "::1" || normalized === "::") return true
  if (normalized.startsWith("fe8") || normalized.startsWith("fe9") ||
      normalized.startsWith("fea") || normalized.startsWith("feb")) return true // link-local fe80::/10
  if (normalized.startsWith("fc") || normalized.startsWith("fd")) return true // unique local fc00::/7
  if (normalized.startsWith("ff")) return true // multicast
  // IPv4-mapped/compatible IPv6 (::ffff:a.b.c.d or ::a.b.c.d) -- unwrap and re-check as IPv4.
  const mapped = normalized.match(/(?:^::ffff:|^::)(\d+\.\d+\.\d+\.\d+)$/)
  if (mapped) return isPrivateIPv4(mapped[1])
  return false
}

function isPrivateIp(ip: string): boolean {
  return isIPv4(ip) ? isPrivateIPv4(ip) : isPrivateIPv6(ip)
}

/**
 * Resolves `hostname` and returns true only if every resolved address is a public,
 * routable IP. Fails closed (returns false) on any DNS error -- an unresolvable host is not
 * something we should attempt to fetch anyway.
 */
export async function isPubliclyRoutableHostname(
  hostname: string,
): Promise<boolean> {
  // A literal IP in the URL (no DNS involved) -- validate it directly.
  if (isIPv4(hostname) || hostname.includes(":")) {
    return !isPrivateIp(hostname)
  }
  try {
    const records = await lookup(hostname, { all: true, verbatim: true })
    if (records.length === 0) return false
    return records.every((record) => !isPrivateIp(record.address))
  } catch {
    return false
  }
}
