/**
 * Where a `?next=` value may send someone after sign-in: a path on this
 * site, or nowhere.
 *
 * A prefix check ("starts with `/`, not `//`") is not enough: browsers parse
 * a backslash as a slash and drop tabs and newlines, so `/\evil.com` and
 * `/<tab>/evil.com` both pass it and still land on another host. Instead the
 * value is resolved the way the browser will resolve it, and only kept if
 * it stays on this origin. The returned path is rebuilt from the parsed URL,
 * so what is redirected to is exactly what was checked.
 */
const ORIGIN = 'https://mercantor.invalid';

export function safeNextPath(requested: string | null | undefined): string | null {
  if (!requested || !requested.startsWith('/')) return null;
  let url: URL;
  try {
    url = new URL(requested, ORIGIN);
  } catch {
    return null;
  }
  if (url.origin !== ORIGIN) return null;
  return `${url.pathname}${url.search}${url.hash}`;
}
