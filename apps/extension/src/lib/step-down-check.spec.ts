import { detectStepDown, isAffiliateLanding } from "./step-down-check";

describe("detectStepDown", () => {
  it("detects a competitor using the same network parameter key", () => {
    expect(
      detectStepDown(
        [],
        "https://shop.test/?sscid=competitor",
        "sscid",
        "",
        "ours",
      ),
    ).toBe(true);
  });
  it("excludes only the exact cookie value set by our own attribution", () => {
    expect(
      detectStepDown(
        [{ name: "sscid", value: "ours" }],
        "https://shop.test",
        null,
        null,
        null,
        [{ name: "sscid", value: "ours" }],
      ),
    ).toBe(false);
    expect(
      detectStepDown(
        [{ name: "sscid", value: "theirs" }],
        "https://shop.test",
        null,
        null,
        null,
        [{ name: "sscid", value: "ours" }],
      ),
    ).toBe(true);
  });
  it("detects a known competing affiliate cookie", () => {
    const cookies = [{ name: "irclickid" }];
    expect(detectStepDown(cookies, "https://shop.example.com/checkout")).toBe(
      true,
    );
  });

  it("is case-insensitive on cookie names", () => {
    const cookies = [{ name: "CJEVENT" }];
    expect(detectStepDown(cookies, "https://shop.example.com/checkout")).toBe(
      true,
    );
  });

  it("returns false when no competing signal is present", () => {
    const cookies = [{ name: "session_id" }, { name: "cart_token" }];
    expect(detectStepDown(cookies, "https://shop.example.com/checkout")).toBe(
      false,
    );
  });

  it("detects a known competing affiliate URL param", () => {
    const cookies: { name: string }[] = [];
    expect(
      detectStepDown(cookies, "https://shop.example.com/checkout?sscid=abc123"),
    ).toBe(true);
  });

  it("does not treat our own tracking param as a competing signal", () => {
    const cookies: { name: string }[] = [];
    // sscid is in the known list. Simulate it being *our own* param for this merchant.
    expect(
      detectStepDown(
        cookies,
        "https://shop.example.com/checkout?sscid=ours",
        "sscid",
        "",
        "ours",
      ),
    ).toBe(false);
  });

  it("returns false for a malformed URL rather than throwing", () => {
    expect(detectStepDown([], "not-a-url")).toBe(false);
  });

  it("detects a competing affiliate URL param carried only in the referrer", () => {
    const cookies: { name: string }[] = [];
    expect(
      detectStepDown(
        cookies,
        "https://shop.example.com/checkout",
        undefined,
        "https://ref.example.com/?sscid=abc123",
      ),
    ).toBe(true);
  });

  it("does not treat our own tracking param in the referrer as a competing signal", () => {
    const cookies: { name: string }[] = [];
    expect(
      detectStepDown(
        cookies,
        "https://shop.example.com/checkout",
        "sscid",
        "https://ref.example.com/?sscid=ours",
        "ours",
      ),
    ).toBe(false);
  });

  it("ignores a malformed or missing referrer rather than throwing", () => {
    expect(
      detectStepDown(
        [],
        "https://shop.example.com/checkout",
        undefined,
        "not-a-url",
      ),
    ).toBe(false);
    expect(
      detectStepDown(
        [],
        "https://shop.example.com/checkout",
        undefined,
        undefined,
      ),
    ).toBe(false);
  });
});

describe("isAffiliateLanding", () => {
  it("matches network parameters case-insensitively (Rakuten sends ranSiteID/ranMID)", () => {
    expect(
      isAffiliateLanding("https://shop.test/p?ranSiteID=abc&ranMID=1", null),
    ).toBe(true);
  });

  it("recognises Target's Impact click parameters and the afsrc stand-down flag", () => {
    expect(
      isAffiliateLanding("https://www.target.com/p/x?clkid=1a2b&lnm=81938", null),
    ).toBe(true);
    expect(isAffiliateLanding("https://shop.test/?afsrc=1", null)).toBe(true);
  });

  it("treats Amazon Associates tags as affiliate only on Amazon", () => {
    expect(
      isAffiliateLanding("https://www.amazon.com/dp/B0?tag=someblog-20", null),
    ).toBe(true);
    expect(isAffiliateLanding("https://blog.test/posts?tag=shoes", null)).toBe(
      false,
    );
  });

  it("recognises affiliate utm values but not ordinary marketing ones", () => {
    expect(
      isAffiliateLanding("https://shop.test/?utm_medium=affiliate", null),
    ).toBe(true);
    expect(
      isAffiliateLanding("https://shop.test/?utm_source=rakuten", null),
    ).toBe(true);
    expect(
      isAffiliateLanding("https://shop.test/?utm_medium=email&utm_source=newsletter", null),
    ).toBe(false);
  });

  it("detects a redirect hop through an affiliate network even when the merchant URL is clean", () => {
    expect(
      isAffiliateLanding(
        "https://shop.test/",
        "https://www.anrdoezrs.net/click-123-456",
      ),
    ).toBe(true);
    expect(
      isAffiliateLanding("https://shop.test/", "https://goto.target.com/c/123/81938/2092"),
    ).toBe(true);
    expect(
      isAffiliateLanding("https://shop.test/", "https://www.google.com/search?q=shoes"),
    ).toBe(false);
  });

  it("never counts Saverlly's own parameter or sub-id as a competitor", () => {
    const own = { key: "clickid", value: "saverlly", subIdKey: "subid1" };
    expect(
      isAffiliateLanding("https://shop.test/?clickid=saverlly&subid1=dev-1", null, own),
    ).toBe(false);
    expect(
      isAffiliateLanding("https://shop.test/?clickid=someone-else", null, own),
    ).toBe(true);
  });

  it("is not triggered by an ordinary visit", () => {
    expect(isAffiliateLanding("https://shop.test/cart?ref=nav", null)).toBe(false);
  });
});
