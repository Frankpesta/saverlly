export function urlHasParam(url: string, key: string): boolean {
  try {
    return new URL(url).searchParams.has(key);
  } catch {
    return false;
  }
}

export function appendUrlParam(url: string, key: string, value: string): string {
  const parsed = new URL(url);
  parsed.searchParams.set(key, value);
  return parsed.toString();
}
