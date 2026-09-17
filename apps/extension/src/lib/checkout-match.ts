export function matchesCheckoutUrl(url: string, patterns: string[]): boolean {
  if (patterns.length === 0) return false;
  let pathname: string;
  try {
    const parsed = new URL(url);
    pathname = (parsed.pathname + parsed.hash.replace(/^#/, "")).toLowerCase();
  } catch {
    pathname = url.toLowerCase();
  }
  return patterns.some((pattern) => {
    let path = pattern.trim().toLowerCase();
    if (!path) return false;
    if (/^https?:\/\//.test(path)) {
      try {
        path = new URL(path).pathname;
      } catch {
        return false;
      }
    }
    const escaped = path
      .split("*")
      .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
      .join(".*");
    return new RegExp(escaped).test(pathname);
  });
}
