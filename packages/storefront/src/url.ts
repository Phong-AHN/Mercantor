/**
 * URL handling for the crawler.
 *
 * A storefront serves the same page under many URLs — with a tracking
 * parameter, with a trailing slash, with a session id, as a collection filter
 * permutation. A crawler that treats those as different pages does three
 * expensive things at once: it spends its page budget on duplicates, it files
 * the same finding several times, and it tells the merchant they have 4,000
 * pages when they have 300.
 *
 * So every URL is reduced to a canonical form before anything else happens, and
 * everything downstream keys on that form.
 */

/**
 * Query parameters that never change what a page says.
 *
 * Campaign tags, click ids and the analytics debris that accumulates on shared
 * links. Removed rather than kept, because a product page reached from a
 * newsletter is the same product page.
 */
/*
 * Everything NOT listed here survives, which is the important half of the rule:
 * `variant`, `page`, `q`, `sort_by`, `filter`, `currency` and `lang` all change
 * what the page says. A variant is a different product page in every way a
 * shopper cares about — different price, image and availability — and dropping
 * it would collapse a catalogue into one row.
 */
const TRACKING_PARAMS = [
  /^utm_/i,
  /^ga_/i,
  /^_ga$/i,
  /^gclid$/i,
  /^gbraid$/i,
  /^wbraid$/i,
  /^fbclid$/i,
  /^msclkid$/i,
  /^ttclid$/i,
  /^igshid$/i,
  /^mc_(cid|eid)$/i,
  /^ref$/i,
  /^source$/i,
  /^_branch_match_id$/i,
  /^srsltid$/i,
];

export interface NormaliseOptions {
  /** Keep the fragment. Off by default: `#reviews` is the same document. */
  keepFragment?: boolean;
}

/**
 * The canonical form of a URL, or null when it is not a URL worth crawling.
 *
 * Null rather than throwing: a storefront links to `mailto:`, `tel:`,
 * `javascript:void(0)` and the occasional malformed href, and every one of them
 * arrives as a link the crawler has to make a decision about.
 */
export function normaliseUrl(raw: string, base?: string): string | null {
  const trimmed = raw?.trim();
  if (!trimmed) return null;

  let url: URL;
  try {
    url = base ? new URL(trimmed, base) : new URL(trimmed);
  } catch {
    return null;
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;

  url.hash = '';
  url.username = '';
  url.password = '';
  url.hostname = url.hostname.toLowerCase();

  // Default ports are noise: https://shop.com:443/ is https://shop.com/.
  if (
    (url.protocol === 'https:' && url.port === '443') ||
    (url.protocol === 'http:' && url.port === '80')
  ) {
    url.port = '';
  }

  const params = [...url.searchParams.entries()]
    .filter(([key]) => !TRACKING_PARAMS.some((pattern) => pattern.test(key)))
    // Sorted so ?page=2&variant=7 and ?variant=7&page=2 are one page, not two.
    .sort(([a], [b]) => a.localeCompare(b));
  url.search = '';
  for (const [key, value] of params) url.searchParams.append(key, value);

  // One trailing slash policy, applied to paths only: the root keeps its slash,
  // everything else loses it. Without this, /about and /about/ are two pages
  // with identical content and identical findings.
  if (url.pathname.length > 1 && url.pathname.endsWith('/')) {
    url.pathname = url.pathname.replace(/\/+$/, '');
  }

  return url.toString();
}

/** Same site, including subdomain. Crawling stays inside the storefront. */
export function isSameSite(candidate: string, root: string): boolean {
  try {
    return new URL(candidate).host === new URL(root).host;
  } catch {
    return false;
  }
}

/**
 * Does this URL match one of the patterns?
 *
 * Patterns are globs over the path and query, not regular expressions: they are
 * typed into a settings form by people who should not have to escape a dot to
 * exclude `/cart`.
 */
export function matchesPattern(url: string, patterns: readonly string[]): boolean {
  if (patterns.length === 0) return false;
  let target: string;
  try {
    const parsed = new URL(url);
    target = parsed.pathname + parsed.search;
  } catch {
    return false;
  }
  return patterns.some((pattern) => globToRegExp(pattern).test(target));
}

function globToRegExp(pattern: string): RegExp {
  const escaped = pattern
    .trim()
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    // `**` crosses path separators, `*` does not — the distinction that lets
    // `/products/*` mean the product list and `/products/**` mean everything
    // underneath it. Translated in ONE pass: doing `**` first and `*` second
    // needs a placeholder between them, and any placeholder is a string some
    // pattern could legitimately contain.
    .replace(/\*\*|\*|\?/g, (token) => (token === '**' ? '.*' : token === '*' ? '[^/]*' : '.'));
  return new RegExp(`^${escaped}$`, 'i');
}

/**
 * Should the crawler fetch this URL at all?
 *
 * Exclusions beat inclusions: a person who excludes `/cart` has said something
 * deliberate, and an include rule written months earlier should not quietly
 * override it.
 */
export function shouldCrawl(
  url: string,
  options: {
    root: string;
    includePatterns?: readonly string[];
    excludePatterns?: readonly string[];
  },
): { crawl: boolean; reason?: string } {
  if (!isSameSite(url, options.root)) return { crawl: false, reason: 'off-site' };
  if (matchesPattern(url, options.excludePatterns ?? []))
    return { crawl: false, reason: 'excluded by pattern' };
  if (
    (options.includePatterns ?? []).length > 0 &&
    !matchesPattern(url, options.includePatterns ?? [])
  ) {
    return { crawl: false, reason: 'outside the include patterns' };
  }
  return { crawl: true };
}
