import type { PageDocument } from '@relay/storefront';

/**
 * Reading a storefront page from its HTML alone, with no browser.
 *
 * Deliberately regex-level rather than a DOM: this runs inside a server
 * action on up to 5 MB of markup, and every question asked of it (title,
 * meta, headings, images, links, referenced assets) is answerable from tags.
 * What it cannot see - anything rendered by JavaScript, console errors,
 * failed requests - is left empty rather than guessed, and the checks that
 * need it simply do not fire.
 */

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  '#39': "'",
};

export function decodeEntities(value: string): string {
  return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+|#39);/gi, (match, entity: string) => {
    const lower = entity.toLowerCase();
    if (lower.startsWith('#x')) return safeCodePoint(parseInt(lower.slice(2), 16), match);
    if (lower.startsWith('#')) return safeCodePoint(parseInt(lower.slice(1), 10), match);
    return ENTITIES[lower] ?? match;
  });
}

function safeCodePoint(code: number, fallback: string): string {
  try {
    return String.fromCodePoint(code);
  } catch {
    return fallback;
  }
}

function stripTags(html: string): string {
  return decodeEntities(html.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
}

/** Attributes of one opening tag, lower-cased names. A bare attribute maps to ''. */
export function parseAttributes(tag: string): Record<string, string> {
  const attributes: Record<string, string> = {};
  const body = tag.replace(/^<\s*[a-z0-9-]+/i, '').replace(/\/?>$/, '');
  const pattern = /([^\s"'=<>`/]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  for (const match of body.matchAll(pattern)) {
    const name = match[1]!.toLowerCase();
    if (name in attributes) continue;
    attributes[name] = decodeEntities(match[2] ?? match[3] ?? match[4] ?? '');
  }
  return attributes;
}

function tags(html: string, name: string): Array<Record<string, string>> {
  const pattern = new RegExp(`<${name}\\b[^>]*>`, 'gi');
  return [...html.matchAll(pattern)].map((match) => parseAttributes(match[0]));
}

function absolute(raw: string | undefined, base: string): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed || trimmed.startsWith('data:') || trimmed.startsWith('#')) return null;
  try {
    const url = new URL(trimmed, base);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}

/** Markup that is never visible copy. */
function withoutInvisible(html: string): string {
  return html
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style|noscript|template|svg|iframe)\b[\s\S]*?<\/\1>/gi, ' ');
}

export function extractDocument(html: string, pageUrl: string, httpStatus: number): PageDocument {
  const visible = withoutInvisible(html);

  const titleMatch = /<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(visible);
  const meta = tags(visible, 'meta');
  const description = meta.find(
    (attributes) => (attributes.name ?? '').toLowerCase() === 'description',
  );

  const h1 = [...visible.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/gi)]
    .map((match) => stripTags(match[1]!))
    .filter(Boolean);

  // Navigation and footer repeat on every page; leaving them in would file
  // the same placeholder once per page instead of once.
  const body = /<body\b[^>]*>([\s\S]*)<\/body>/i.exec(visible)?.[1] ?? visible;
  const main = body.replace(/<(header|nav|footer)\b[\s\S]*?<\/\1>/gi, ' ');

  const images = tags(visible, 'img')
    .map((attributes) => {
      const src = absolute(attributes.src || attributes['data-src'], pageUrl);
      if (!src) return null;
      return { src, alt: 'alt' in attributes ? attributes.alt! : null, loaded: true };
    })
    .filter((image): image is { src: string; alt: string | null; loaded: boolean } => !!image);

  const links = [...visible.matchAll(/<a\b[^>]*>([\s\S]*?)<\/a>/gi)]
    .map((match) => {
      const attributes = parseAttributes(/^<a\b[^>]*>/i.exec(match[0])![0]);
      const href = absolute(attributes.href, pageUrl);
      return href ? { href, text: stripTags(match[1]!).slice(0, 200) } : null;
    })
    .filter((link): link is { href: string; text: string } => !!link);

  return {
    url: pageUrl,
    httpStatus,
    title: titleMatch ? stripTags(titleMatch[1]!) : null,
    metaDescription: description ? (description.content ?? '').trim() : null,
    h1,
    text: stripTags(main),
    images,
    links,
    consoleErrors: [],
    failedRequests: [],
  };
}

/** Script and stylesheet URLs, for platform detection and the request count. */
export function assetUrls(html: string, pageUrl: string): { scripts: string[]; styles: string[] } {
  const clean = html.replace(/<!--[\s\S]*?-->/g, ' ');
  const scripts = tags(clean, 'script')
    .map((attributes) => absolute(attributes.src, pageUrl))
    .filter((url): url is string => !!url);
  const styles = tags(clean, 'link')
    .filter((attributes) => /\bstylesheet\b/i.test(attributes.rel ?? ''))
    .map((attributes) => absolute(attributes.href, pageUrl))
    .filter((url): url is string => !!url);
  return { scripts, styles };
}

/** `shop.example.com` and `cdn.example.com` are the same party. */
function party(host: string): string {
  const labels = host.toLowerCase().split('.');
  // Two-label public suffixes the storefronts here actually use.
  const twoLabel = /^(co|com|net|org|gov|edu)\.[a-z]{2}$/.test(labels.slice(-2).join('.'));
  return labels.slice(twoLabel ? -3 : -2).join('.');
}

export interface HtmlMeasurement {
  /** Every resource the HTML itself references: the document, scripts, styles, images, frames. */
  resourceCount: number;
  scriptCount: number;
  stylesheetCount: number;
  imageCount: number;
  thirdPartyRequests: number;
  thirdPartyHosts: string[];
  htmlBytes: number;
}

/**
 * What a page asks the browser to load, counted from its HTML.
 *
 * This undercounts what a real browser fetches (anything a script loads
 * later is invisible here), which is why runs record `method: html-fetch-v1`
 * and are never compared against browser-measured runs.
 */
export function measureHtml(html: string, pageUrl: string, htmlBytes: number): HtmlMeasurement {
  const clean = html.replace(/<!--[\s\S]*?-->/g, ' ');
  const { scripts, styles } = assetUrls(clean, pageUrl);
  const images = tags(clean, 'img')
    .map((attributes) => absolute(attributes.src || attributes['data-src'], pageUrl))
    .filter((url): url is string => !!url);
  const frames = tags(clean, 'iframe')
    .map((attributes) => absolute(attributes.src, pageUrl))
    .filter((url): url is string => !!url);

  const pageParty = party(new URL(pageUrl).hostname);
  const resources = [...scripts, ...styles, ...images, ...frames];
  const thirdParty = resources.filter((url) => party(new URL(url).hostname) !== pageParty);

  return {
    resourceCount: 1 + resources.length,
    scriptCount: scripts.length,
    stylesheetCount: styles.length,
    imageCount: images.length,
    thirdPartyRequests: thirdParty.length,
    thirdPartyHosts: [...new Set(thirdParty.map((url) => new URL(url).hostname))].sort(),
    htmlBytes,
  };
}
