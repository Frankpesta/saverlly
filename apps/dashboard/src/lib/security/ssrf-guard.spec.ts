import { isPubliclyRoutableHostname } from "./ssrf-guard"

describe("isPubliclyRoutableHostname", () => {
  it("blocks the cloud metadata address", async () => {
    expect(await isPubliclyRoutableHostname("169.254.169.254")).toBe(false)
  })

  it("blocks loopback", async () => {
    expect(await isPubliclyRoutableHostname("127.0.0.1")).toBe(false)
    expect(await isPubliclyRoutableHostname("localhost")).toBe(false)
  })

  it("blocks RFC1918 private ranges", async () => {
    expect(await isPubliclyRoutableHostname("10.0.0.5")).toBe(false)
    expect(await isPubliclyRoutableHostname("172.16.0.5")).toBe(false)
    expect(await isPubliclyRoutableHostname("192.168.1.5")).toBe(false)
  })

  it("blocks IPv6 loopback and unique-local", async () => {
    expect(await isPubliclyRoutableHostname("::1")).toBe(false)
    expect(await isPubliclyRoutableHostname("fd00::1")).toBe(false)
  })

  it("allows a public IP", async () => {
    expect(await isPubliclyRoutableHostname("8.8.8.8")).toBe(true)
  })

  it("fails closed on an unresolvable hostname", async () => {
    expect(
      await isPubliclyRoutableHostname(
        "this-host-should-never-resolve.invalid",
      ),
    ).toBe(false)
  })
})
