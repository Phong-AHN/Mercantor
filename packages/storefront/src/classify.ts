/**
 * What kind of page is this?
 *
 * The page type decides almost everything downstream: which checks run, which
 * templates get a performance measurement, how findings are grouped in a
 * report, and what "300 pages" is actually made of. It is derived from the URL
 * shape, which every hosted platform makes fairly regular, and corrected by
 * hand where the guess is wrong — `pageTypeConfirmed` then keeps the next crawl
 * from overwriting the correction.
 */

export type PageType =
  | 'HOME'
  | 'COLLECTION'
  | 'PRODUCT'
  | 'CART'
  | 'CHECKOUT'
  | 'SEARCH'
  | 'ACCOUNT'
  | 'BLOG'
  | 'ARTICLE'
  | 'POLICY'
  | 'CONTENT'
  | 'OTHER';

/**
 * Path patterns, most specific first.
 *
 * Shopify, SHOPLINE, WooCommerce and Magento differ in wording but agree in
 * shape: a product lives under a products segment, a category under a
 * collection or category segment. Matching the segment rather than the whole
 * path keeps locale prefixes (`/en/`, `/vi-vn/`) from defeating every rule.
 */
const RULES: Array<{ type: PageType; test: RegExp }> = [
  { type: 'CHECKOUT', test: /(^|\/)(checkout|checkouts|order-confirm|thank[-_]?you)(\/|$)/i },
  { type: 'CART', test: /(^|\/)(cart|shopping-cart|basket|gio-hang)(\/|$)/i },
  {
    type: 'ACCOUNT',
    test: /(^|\/)(account|login|register|sign-?in|sign-?up|customer|profile|wishlist|orders)(\/|$)/i,
  },
  { type: 'SEARCH', test: /(^|\/)(search|tim-kiem)(\/|$)/i },
  { type: 'PRODUCT', test: /(^|\/)(products?|p|san-pham|item)\/[^/]+/i },
  { type: 'COLLECTION', test: /(^|\/)(collections?|categor(y|ies)|shop|catalog|danh-muc)(\/|$)/i },
  { type: 'ARTICLE', test: /(^|\/)(blogs?|news|articles?|tin-tuc)\/[^/]+\/[^/]+/i },
  { type: 'BLOG', test: /(^|\/)(blogs?|news|articles?|tin-tuc)(\/|$)/i },
  {
    type: 'POLICY',
    test: /(^|\/)(policies|policy|terms|privacy|refund|shipping-policy|legal|chinh-sach)(\/|$)/i,
  },
  {
    type: 'CONTENT',
    test: /(^|\/)(pages?|about|contact|faq|help|support|gioi-thieu|lien-he)(\/|$)/i,
  },
];

export function classifyPageType(url: string): PageType {
  let path: string;
  try {
    path = new URL(url).pathname;
  } catch {
    return 'OTHER';
  }

  const normalised = path.replace(/\/+$/, '');
  if (normalised === '' || normalised === '/index.html') return 'HOME';

  for (const rule of RULES) {
    if (rule.test.test(normalised)) return rule.type;
  }
  return 'OTHER';
}

/**
 * Which page types are worth a performance measurement, and under which
 * template name.
 *
 * The requirement is explicit that one score must not stand for a whole store,
 * and equally explicit about which templates matter. Checkout is included but
 * flagged: on a hosted platform it is frequently unmeasurable, and a report
 * that silently omits it reads as if it were fine.
 */
export const PERF_TEMPLATES = {
  HOME: 'HOME',
  COLLECTION: 'COLLECTION',
  PRODUCT: 'PRODUCT',
  CART: 'CART',
  CHECKOUT: 'CHECKOUT',
} as const;

export type PerfTemplate = keyof typeof PERF_TEMPLATES;

export function perfTemplateFor(type: PageType): PerfTemplate | null {
  return type in PERF_TEMPLATES ? (type as PerfTemplate) : null;
}

/**
 * Pick one representative URL per template from everything discovered.
 *
 * Measuring every product page is neither affordable nor informative; measuring
 * whichever product page happens to be first is not reproducible. The choice is
 * the shortest URL of the type, which in practice is the most canonical one and
 * — importantly — is the same choice on every run, so the trend line compares
 * like with like.
 */
export function pickPerfTargets(pages: ReadonlyArray<{ url: string; pageType: PageType }>): Array<{
  template: PerfTemplate;
  url: string;
}> {
  const byTemplate = new Map<PerfTemplate, string>();
  for (const page of pages) {
    const template = perfTemplateFor(page.pageType);
    if (!template) continue;
    const current = byTemplate.get(template);
    if (current === undefined || page.url.length < current.length)
      byTemplate.set(template, page.url);
  }
  return [...byTemplate].map(([template, url]) => ({ template, url }));
}
