const INTERNAL_ORIGIN = "https://appordini.invalid";

export function safeInternalRedirectPath(value: string) {
  if (!value.startsWith("/")) return null;

  try {
    const base = new URL(INTERNAL_ORIGIN);
    const target = new URL(value, base);
    if (target.origin !== base.origin) return null;
    return `${target.pathname}${target.search}${target.hash}`;
  } catch {
    return null;
  }
}
