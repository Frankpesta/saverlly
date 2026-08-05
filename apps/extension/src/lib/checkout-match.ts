export function matchesCheckoutUrl(url: string, patterns: string[]): boolean {
  if (patterns.length === 0) return false;
  let pathname: string;
  try {
    pathname = new URL(url).pathname.toLowerCase();
  } catch {
    pathname = url.toLowerCase();
  }
  return patterns.some((pattern) => pathname.includes(pattern.toLowerCase()));
}
