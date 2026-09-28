import { createHash } from 'node:crypto';

/**
 * The checks that need no model and no judgement.
 *
 * A broken link is a fact. A missing alt attribute is a fact. These run on
 * every page of every crawl, cost nothing, and never need a reviewer to decide
 * whether they are real — which is exactly why they are separated from the
 * model's opinions about wording. The reviewer's attention is the scarce
 * resource in this product; spending it on facts is the waste to avoid.
 */

export type FindingCategory =
  | 'SPELLING'
  | 'GRAMMAR'
  | 'BROKEN_LINK'
  | 'MISSING_IMAGE'
  | 'MISSING_ALT'
  | 'META_TITLE'
  | 'META_DESCRIPTION'
  | 'PLACEHOLDER_TEXT'
  | 'CONTENT_INCONSISTENCY'
  | 'MOBILE_LAYOUT'
  | 'RECOMMENDATION'
  | 'CONSOLE_ERROR'
  | 'NETWORK_ERROR'
  | 'PERFORMANCE'
  | 'OTHER';

export type FindingSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

/** What a crawl extracted from one page, in the shape the checks consume. */
export interface PageDocument {
  url: string;
  httpStatus: number;
  title: string | null;
  metaDescription: string | null;
  h1: string[];
  /** Visible copy with navigation and footer removed. */
  text: string;
  images: Array<{ src: string; alt: string | null; loaded: boolean }>;
  links: Array<{ href: string; text: string; status?: number }>;
  consoleErrors: Array<{ message: string; source?: string }>;
  failedRequests: Array<{ url: string; status?: number; reason?: string }>;
}

export interface CheckFinding {
  category: FindingCategory;
  severity: FindingSeverity;
  /** The rule that fired, and the unit of turning a rule off. */
  detector: string;
  title: string;
  evidenceText?: string;
  evidenceContext?: Record<string, unknown>;
  suggestion?: string;
  recommendation?: string;
}

/**
 * Text that ships when someone forgot to replace it.
 *
 * Deliberately narrow. "Sample" and "test" appear in legitimate product copy,
 * and a check that cries wolf on a "Sample Sale" collection gets switched off
 * within a week — taking the real lorem ipsum catch with it.
 */
const PLACEHOLDER_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /lorem ipsum/i, label: 'Lorem ipsum' },
  { pattern: /dolor sit amet/i, label: 'Lorem ipsum' },
  { pattern: /\byour (store|shop|company|brand) name\b/i, label: 'Theme placeholder' },
  {
    pattern: /\b(insert|add) (your )?(text|description|image|logo) here\b/i,
    label: 'Theme placeholder',
  },
  { pattern: /\bcoming soon\b/i, label: 'Unfinished content' },
  { pattern: /\b(TODO|TBD|FIXME|XXX)\b/, label: 'Developer note' },
  { pattern: /\bplaceholder\b/i, label: 'Placeholder' },
  { pattern: /\bundefined\b/, label: 'Rendered undefined' },
  { pattern: /\bNaN\b/, label: 'Rendered NaN' },
  { pattern: /\[object Object\]/i, label: 'Rendered object' },
  // Real template tags carry dots, filters and pipes - `{{ product.title }}`,
  // `{{ price | money }}` - so matching a bare word missed every tag a broken
  // Liquid template actually leaks.
  { pattern: /\{\{[^{}]{1,120}\}\}/, label: 'Unrendered template tag' },
  { pattern: /\{%[^{}%]{1,120}%\}/, label: 'Unrendered template statement' },
];

/** Google truncates around these lengths; outside them the snippet is wasted. */
const TITLE_MIN = 15;
const TITLE_MAX = 65;
const META_MIN = 70;
const META_MAX = 165;

export function checkPage(doc: PageDocument): CheckFinding[] {
  const findings: CheckFinding[] = [];

  // ── Metadata ──────────────────────────────────────────────────────────────
  if (!doc.title?.trim()) {
    findings.push({
      category: 'META_TITLE',
      severity: 'HIGH',
      detector: 'meta.title.missing',
      title: 'Page has no title',
      recommendation: 'Add a title tag describing this page in under 65 characters.',
    });
  } else if (doc.title.trim().length > TITLE_MAX) {
    findings.push({
      category: 'META_TITLE',
      severity: 'LOW',
      detector: 'meta.title.length',
      title: `Title is ${doc.title.trim().length} characters and will be cut short in search results`,
      evidenceText: doc.title.trim(),
      recommendation: `Shorten to under ${TITLE_MAX} characters.`,
    });
  } else if (doc.title.trim().length < TITLE_MIN) {
    findings.push({
      category: 'META_TITLE',
      severity: 'LOW',
      detector: 'meta.title.short',
      title: 'Title is too short to describe the page',
      evidenceText: doc.title.trim(),
    });
  }

  if (!doc.metaDescription?.trim()) {
    findings.push({
      category: 'META_DESCRIPTION',
      severity: 'MEDIUM',
      detector: 'meta.description.missing',
      title: 'Page has no meta description',
      recommendation: `Add a description of ${META_MIN}-${META_MAX} characters.`,
    });
  } else {
    const length = doc.metaDescription.trim().length;
    if (length > META_MAX || length < META_MIN) {
      findings.push({
        category: 'META_DESCRIPTION',
        severity: 'LOW',
        detector: 'meta.description.length',
        title: `Meta description is ${length} characters`,
        evidenceText: doc.metaDescription.trim(),
        recommendation: `Aim for ${META_MIN}-${META_MAX} characters.`,
      });
    }
  }

  if (doc.h1.length === 0) {
    findings.push({
      category: 'CONTENT_INCONSISTENCY',
      severity: 'LOW',
      detector: 'heading.h1.missing',
      title: 'Page has no H1 heading',
    });
  } else if (doc.h1.length > 1) {
    findings.push({
      category: 'CONTENT_INCONSISTENCY',
      severity: 'LOW',
      detector: 'heading.h1.multiple',
      title: `Page has ${doc.h1.length} H1 headings`,
      evidenceText: doc.h1.join(' | '),
    });
  }

  // ── Images ────────────────────────────────────────────────────────────────
  const missingAlt = doc.images.filter((img) => img.alt === null || img.alt.trim() === '');
  if (missingAlt.length > 0) {
    findings.push({
      category: 'MISSING_ALT',
      severity: 'MEDIUM',
      detector: 'image.alt.missing',
      title: `${missingAlt.length} image${missingAlt.length === 1 ? '' : 's'} without alt text`,
      evidenceContext: { images: missingAlt.slice(0, 10).map((img) => img.src) },
      recommendation: 'Describe each image for shoppers using a screen reader.',
    });
  }

  for (const image of doc.images.filter((img) => !img.loaded)) {
    findings.push({
      category: 'MISSING_IMAGE',
      severity: 'HIGH',
      detector: 'image.broken',
      title: 'Image does not load',
      evidenceText: image.src,
      evidenceContext: { src: image.src, alt: image.alt },
    });
  }

  // ── Links ─────────────────────────────────────────────────────────────────
  for (const link of doc.links) {
    if (link.status !== undefined && link.status >= 400) {
      findings.push({
        category: 'BROKEN_LINK',
        severity: link.status === 404 ? 'HIGH' : 'MEDIUM',
        detector: 'link.broken',
        title: `Link returns ${link.status}`,
        evidenceText: link.text?.trim() || link.href,
        evidenceContext: { href: link.href, status: link.status },
      });
    }
  }

  // ── Copy that should not have shipped ────────────────────────────────────
  for (const { pattern, label } of PLACEHOLDER_PATTERNS) {
    const match = pattern.exec(doc.text);
    if (!match) continue;
    findings.push({
      category: 'PLACEHOLDER_TEXT',
      severity: 'HIGH',
      detector: 'content.placeholder',
      title: `${label} is visible on the page`,
      evidenceText: excerpt(doc.text, match.index, match[0].length),
      evidenceContext: { matched: match[0] },
      recommendation: 'Replace with the real copy before launch.',
    });
  }

  // ── What the browser complained about ────────────────────────────────────
  for (const error of dedupeBy(doc.consoleErrors, (e) => e.message).slice(0, 5)) {
    findings.push({
      category: 'CONSOLE_ERROR',
      severity: 'MEDIUM',
      detector: 'browser.console.error',
      title: 'JavaScript error on page load',
      evidenceText: error.message.slice(0, 500),
      evidenceContext: { source: error.source },
    });
  }

  for (const request of dedupeBy(doc.failedRequests, (r) => r.url).slice(0, 5)) {
    findings.push({
      category: 'NETWORK_ERROR',
      severity: request.status && request.status >= 500 ? 'HIGH' : 'MEDIUM',
      detector: 'browser.request.failed',
      title: `Request failed${request.status ? ` with ${request.status}` : ''}`,
      evidenceText: request.url,
      evidenceContext: { status: request.status, reason: request.reason },
    });
  }

  return findings;
}

/**
 * Checks that need the whole site, not one page.
 *
 * Duplicate titles and descriptions are invisible page by page and obvious
 * across a crawl, which is why they run here rather than in `checkPage`.
 */
export function checkSite(
  pages: ReadonlyArray<{ url: string; title: string | null; metaDescription: string | null }>,
): Array<CheckFinding & { url: string }> {
  const findings: Array<CheckFinding & { url: string }> = [];

  for (const [field, detector, category] of [
    ['title', 'meta.title.duplicate', 'META_TITLE'],
    ['metaDescription', 'meta.description.duplicate', 'META_DESCRIPTION'],
  ] as const) {
    const groups = new Map<string, string[]>();
    for (const page of pages) {
      const value = (field === 'title' ? page.title : page.metaDescription)?.trim();
      if (!value) continue;
      const list = groups.get(value) ?? [];
      list.push(page.url);
      groups.set(value, list);
    }

    for (const [value, urls] of groups) {
      if (urls.length < 2) continue;
      for (const url of urls) {
        findings.push({
          url,
          category,
          severity: 'LOW',
          detector,
          title: `${field === 'title' ? 'Title' : 'Meta description'} is shared with ${urls.length - 1} other page${urls.length === 2 ? '' : 's'}`,
          evidenceText: value,
          evidenceContext: { sharedWith: urls.filter((u) => u !== url).slice(0, 10) },
        });
      }
    }
  }

  return findings;
}

/**
 * The identity of a problem, stable across scans.
 *
 * Without this, a crawl every morning files the same missing alt text every
 * morning, and by Friday the reviewer has 500 findings and no idea which five
 * are new. The fingerprint deliberately excludes anything that drifts between
 * runs — counts, timestamps, the order of a list — and includes only what makes
 * this problem this problem.
 */
export function fingerprint(input: {
  category: FindingCategory;
  detector: string;
  url: string;
  evidenceText?: string;
}): string {
  const evidence = (input.evidenceText ?? '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    // Numbers that count things ("3 images without alt text") change between
    // runs while the problem stays the same.
    .replace(/\d+/g, '#')
    .trim()
    .slice(0, 200);

  return createHash('sha256')
    .update([input.category, input.detector, input.url, evidence].join('\u0000'))
    .digest('hex')
    .slice(0, 32);
}

function excerpt(text: string, index: number, length: number, padding = 60): string {
  const start = Math.max(0, index - padding);
  const end = Math.min(text.length, index + length + padding);
  return `${start > 0 ? '…' : ''}${text.slice(start, end).trim()}${end < text.length ? '…' : ''}`;
}

function dedupeBy<T>(items: readonly T[], key: (item: T) => string): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of items) {
    const k = key(item);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(item);
  }
  return out;
}
