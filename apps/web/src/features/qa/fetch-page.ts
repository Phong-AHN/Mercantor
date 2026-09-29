import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { isPasswordPage, parsePasswordForm } from './password-page';

/**
 * The one place this server fetches a URL somebody typed in.
 *
 * A page URL on a project is user input, and a server that fetches user input
 * is an SSRF risk: `http://169.254.169.254/` or `http://localhost:6379/` typed
 * as a "storefront page" would otherwise be fetched from inside the hosting
 * network. So every fetch here:
 *
 *   - only speaks http(s), on default ports;
 *   - for the page itself, only reaches the project's own storefront hosts
 *     (`allowedHosts`), redirect hops included;
 *   - resolves the hostname first and refuses private, loopback, link-local
 *     and other non-public addresses, for every hop;
 *   - stops after 10 seconds and 5 MB.
 *
 * Residual risk, accepted: the address is checked at lookup time and fetch
 * resolves again, so a DNS answer that changes between the two (rebinding)
 * is not caught. The allowlist narrows this to hosts an agency user
 * configured on a project.
 */

const TIMEOUT_MS = 10_000;
const MAX_BYTES = 5 * 1024 * 1024;
const MAX_REDIRECTS = 5;

export const USER_AGENTS = {
  DESKTOP:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36 MercantorQA/1.0',
  MOBILE:
    'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Mobile Safari/537.36 MercantorQA/1.0',
} as const;

export type Device = keyof typeof USER_AGENTS;

export class FetchRefused extends Error {}

export interface FetchedPage {
  status: number;
  finalUrl: string;
  headers: Record<string, string>;
  cookies: string[];
  html: string;
  bytes: number;
  truncated: boolean;
  ttfbMs: number;
  loadMs: number;
}

/** The hosts a project's pages may live on: the host and its www twin. */
export function allowedHostsFor(urls: ReadonlyArray<string | null | undefined>): string[] {
  const hosts = new Set<string>();
  for (const raw of urls) {
    if (!raw) continue;
    try {
      const host = new URL(raw).hostname.toLowerCase();
      hosts.add(host);
      hosts.add(host.startsWith('www.') ? host.slice(4) : `www.${host}`);
    } catch {
      // A malformed stored URL just contributes nothing.
    }
  }
  return [...hosts];
}

export function isPublicAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) return isPublicV4(address);
  if (family === 6) {
    const lower = address.toLowerCase();
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(lower);
    if (mapped) return isPublicV4(mapped[1]!);
    if (lower === '::' || lower === '::1') return false;
    if (/^f[cd]/.test(lower)) return false; // fc00::/7 unique local
    if (/^fe[89ab]/.test(lower)) return false; // fe80::/10 link-local
    if (/^ff/.test(lower)) return false; // multicast
    if (lower.startsWith('64:ff9b:') || lower.startsWith('2001:db8')) return false;
    return true;
  }
  return false;
}

function isPublicV4(address: string): boolean {
  const [a, b] = address.split('.').map(Number) as [number, number, number, number];
  if (a === 0 || a === 10 || a === 127) return false;
  if (a === 169 && b === 254) return false;
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 192 && b === 168) return false;
  if (a === 100 && b >= 64 && b <= 127) return false; // carrier-grade NAT
  if (a === 192 && b === 0) return false;
  if (a === 198 && (b === 18 || b === 19)) return false;
  if (a >= 224) return false; // multicast and reserved
  return true;
}

/**
 * For requests a page makes inside the headless browser (scripts, images,
 * XHR). Resolving DNS for each of hundreds of requests is too slow, so this
 * refuses what is recognisable without a lookup: non-web schemes, local
 * names, and IP literals that are not public. The top-level page itself
 * still goes through `assertFetchable`.
 */
export function isBlockedSubresource(rawUrl: string): boolean {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return true;
  }
  if (url.protocol === 'data:' || url.protocol === 'blob:') return false;
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return true;
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (host === 'localhost' || /\.(localhost|local|internal)$/.test(host)) return true;
  if (isIP(host)) return !isPublicAddress(host);
  return false;
}

export async function assertFetchable(
  url: URL,
  allowedHosts: readonly string[] | null,
): Promise<void> {
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new FetchRefused('Only http and https pages can be checked.');
  }
  if (url.port && url.port !== '80' && url.port !== '443') {
    throw new FetchRefused('Pages on non-standard ports cannot be checked.');
  }
  if (url.username || url.password) {
    throw new FetchRefused('URLs with credentials in them cannot be checked.');
  }
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (allowedHosts && !allowedHosts.includes(host)) {
    throw new FetchRefused(
      `${host} is not this project's storefront. Set the storefront or destination URL first.`,
    );
  }
  const addresses = isIP(host)
    ? [{ address: host }]
    : await lookup(host, { all: true, verbatim: true }).catch(() => {
        throw new FetchRefused(`${host} does not resolve.`);
      });
  if (addresses.length === 0 || addresses.some((entry) => !isPublicAddress(entry.address))) {
    throw new FetchRefused(`${host} does not point at a public address.`);
  }
}

/** The page is behind a storefront password that is missing or was not accepted. */
export class PasswordRequired extends FetchRefused {}

type CookieJar = Map<string, string>;

function remember(jar: CookieJar, response: Response): void {
  for (const cookie of response.headers.getSetCookie()) {
    const pair = cookie.split(';')[0] ?? '';
    const index = pair.indexOf('=');
    if (index > 0) jar.set(pair.slice(0, index).trim(), pair.slice(index + 1).trim());
  }
}

function cookieHeader(jar: CookieJar): Record<string, string> {
  return jar.size === 0
    ? {}
    : { cookie: [...jar].map(([name, value]) => `${name}=${value}`).join('; ') };
}

/**
 * Fetch one storefront page. Throws `FetchRefused` when the URL is not one
 * this server will fetch; network failures and timeouts reject with the
 * underlying error, which callers record as the run's `error`.
 *
 * When the page turns out to be the storefront's password page and a
 * `password` is given, the form is submitted once (to the same allowed
 * hosts), the session cookie kept, and the page fetched again. Timings then
 * describe the page itself, not the login.
 */
export async function fetchStorefrontPage(
  rawUrl: string,
  options: { allowedHosts: readonly string[]; device: Device; password?: string },
): Promise<FetchedPage> {
  const jar: CookieJar = new Map();
  let page = await fetchFollowing(rawUrl, options, jar);
  if (!isPasswordPage(page.finalUrl, page.html)) return page;

  if (!options.password) {
    throw new PasswordRequired(
      'This storefront is password protected. Add its password in Site QA → Storefront.',
    );
  }
  const form = parsePasswordForm(page.html, page.finalUrl);
  if (!form) throw new PasswordRequired('The storefront password page could not be read.');

  const action = new URL(form.action);
  await assertFetchable(action, options.allowedHosts);
  const body = new URLSearchParams({ ...form.fields, [form.passwordField]: options.password });
  const login = await fetch(
    form.method === 'GET' ? `${action.origin}${action.pathname}?${body}` : action,
    {
      method: form.method,
      redirect: 'manual',
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: {
        'user-agent': USER_AGENTS[options.device],
        ...(form.method === 'POST' ? { 'content-type': 'application/x-www-form-urlencoded' } : {}),
        ...cookieHeader(jar),
      },
      ...(form.method === 'POST' ? { body: body.toString() } : {}),
    },
  );
  remember(jar, login);
  await login.body?.cancel();

  page = await fetchFollowing(rawUrl, options, jar);
  if (isPasswordPage(page.finalUrl, page.html)) {
    throw new PasswordRequired(
      'The storefront password was not accepted. Check it in Site QA → Storefront.',
    );
  }
  return page;
}

async function fetchFollowing(
  rawUrl: string,
  options: { allowedHosts: readonly string[]; device: Device },
  jar: CookieJar,
): Promise<FetchedPage> {
  const started = performance.now();
  let url = new URL(rawUrl);

  for (let hop = 0; ; hop += 1) {
    await assertFetchable(url, options.allowedHosts);
    const response = await fetch(url, {
      redirect: 'manual',
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: {
        'user-agent': USER_AGENTS[options.device],
        accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
        'accept-language': 'en;q=0.9',
        ...cookieHeader(jar),
      },
    });
    remember(jar, response);
    const ttfbMs = Math.round(performance.now() - started);

    const location = response.headers.get('location');
    if (response.status >= 300 && response.status < 400 && location) {
      await response.body?.cancel();
      if (hop >= MAX_REDIRECTS) throw new FetchRefused('Too many redirects.');
      url = new URL(location, url);
      continue;
    }

    const { text, bytes, truncated } = await readCapped(response);
    const headers: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      headers[key.toLowerCase()] = value;
    });
    const cookies = response.headers
      .getSetCookie()
      .map((cookie) => cookie.split('=')[0]!.trim())
      .filter(Boolean);

    return {
      status: response.status,
      finalUrl: url.toString(),
      headers,
      cookies,
      html: text,
      bytes,
      truncated,
      ttfbMs,
      loadMs: Math.round(performance.now() - started),
    };
  }
}

async function readCapped(
  response: Response,
): Promise<{ text: string; bytes: number; truncated: boolean }> {
  if (!response.body) return { text: '', bytes: 0, truncated: false };
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  let truncated = false;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > MAX_BYTES) {
      truncated = true;
      await reader.cancel();
      break;
    }
    chunks.push(value);
  }
  const merged = new Uint8Array(chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0));
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { text: new TextDecoder().decode(merged), bytes, truncated };
}

/**
 * Status of a linked resource, for the broken-link and missing-image checks.
 * Any public host is allowed here (images live on CDNs), but the private
 * address guard still applies, and only headers are read.
 */
export async function probeUrl(rawUrl: string): Promise<number | null> {
  try {
    let url = new URL(rawUrl);
    for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
      await assertFetchable(url, null);
      let response = await fetch(url, {
        method: 'HEAD',
        redirect: 'manual',
        signal: AbortSignal.timeout(6_000),
        headers: { 'user-agent': USER_AGENTS.DESKTOP },
      });
      // Some servers refuse HEAD outright; ask for one byte instead.
      if (response.status === 405 || response.status === 501) {
        response = await fetch(url, {
          method: 'GET',
          redirect: 'manual',
          signal: AbortSignal.timeout(6_000),
          headers: { 'user-agent': USER_AGENTS.DESKTOP, range: 'bytes=0-0' },
        });
        await response.body?.cancel();
      }
      const location = response.headers.get('location');
      if (response.status >= 300 && response.status < 400 && location) {
        url = new URL(location, url);
        continue;
      }
      return response.status;
    }
    return null;
  } catch {
    return null;
  }
}
