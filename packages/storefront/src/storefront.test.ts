import { describe, expect, it } from 'vitest';
import { normaliseUrl, shouldCrawl, matchesPattern } from './url';
import { classifyPageType, pickPerfTargets } from './classify';
import { detectStorefront, detectApps } from './detect';
import { checkPage, checkSite, fingerprint, type PageDocument } from './checks';

/**
 * These tests are the specification for what the crawler considers one page,
 * one platform and one problem. Every case below is a way a real storefront has
 * of making a crawler count wrong.
 */

describe('one page, however it is linked', () => {
  it('drops campaign tags that do not change the page', () => {
    expect(
      normaliseUrl('https://shop.com/products/tee?utm_source=newsletter&utm_medium=email'),
    ).toBe('https://shop.com/products/tee');
    expect(normaliseUrl('https://shop.com/products/tee?fbclid=abc123')).toBe(
      'https://shop.com/products/tee',
    );
  });

  it('keeps the parameters that make it a different product', () => {
    expect(normaliseUrl('https://shop.com/products/tee?variant=4471')).toBe(
      'https://shop.com/products/tee?variant=4471',
    );
    expect(normaliseUrl('https://shop.com/collections/all?page=3')).toBe(
      'https://shop.com/collections/all?page=3',
    );
  });

  it('orders parameters, so the same page linked two ways is one page', () => {
    expect(normaliseUrl('https://shop.com/c?b=2&a=1')).toBe(
      normaliseUrl('https://shop.com/c?a=1&b=2'),
    );
  });

  it('settles the trailing slash, but leaves the root alone', () => {
    expect(normaliseUrl('https://shop.com/about/')).toBe('https://shop.com/about');
    expect(normaliseUrl('https://shop.com/')).toBe('https://shop.com/');
  });

  it('drops the fragment: #reviews is the same document', () => {
    expect(normaliseUrl('https://shop.com/products/tee#reviews')).toBe(
      'https://shop.com/products/tee',
    );
  });

  it('resolves a relative href against the page it was found on', () => {
    expect(normaliseUrl('/collections/sale', 'https://shop.com/products/tee')).toBe(
      'https://shop.com/collections/sale',
    );
  });

  it('refuses what is not a page to crawl', () => {
    expect(normaliseUrl('mailto:hello@shop.com')).toBeNull();
    expect(normaliseUrl('tel:+84123456789')).toBeNull();
    expect(normaliseUrl('javascript:void(0)')).toBeNull();
    expect(normaliseUrl('   ')).toBeNull();
  });
});

describe('what the crawler is allowed to fetch', () => {
  const root = 'https://shop.com/';

  it('stays on the storefront', () => {
    expect(shouldCrawl('https://facebook.com/shop', { root }).crawl).toBe(false);
    expect(shouldCrawl('https://shop.com/products/tee', { root }).crawl).toBe(true);
  });

  it('honours an exclusion over an inclusion', () => {
    const options = { root, includePatterns: ['/**'], excludePatterns: ['/cart', '/checkout/**'] };
    expect(shouldCrawl('https://shop.com/cart', options)).toMatchObject({ crawl: false });
    expect(shouldCrawl('https://shop.com/checkout/step-2', options)).toMatchObject({
      crawl: false,
    });
    expect(shouldCrawl('https://shop.com/products/tee', options).crawl).toBe(true);
  });

  it('knows * stops at a slash and ** does not', () => {
    expect(matchesPattern('https://shop.com/products/tee', ['/products/*'])).toBe(true);
    expect(matchesPattern('https://shop.com/products/tee/reviews', ['/products/*'])).toBe(false);
    expect(matchesPattern('https://shop.com/products/tee/reviews', ['/products/**'])).toBe(true);
  });

  it('says why, so the page list can explain itself', () => {
    expect(shouldCrawl('https://other.com/x', { root }).reason).toBe('off-site');
  });
});

describe('what kind of page it is', () => {
  it.each([
    ['https://shop.com/', 'HOME'],
    ['https://shop.com/products/linen-shirt', 'PRODUCT'],
    ['https://shop.com/collections/summer', 'COLLECTION'],
    ['https://shop.com/cart', 'CART'],
    ['https://shop.com/checkout/contact', 'CHECKOUT'],
    ['https://shop.com/blogs/journal/how-we-dye', 'ARTICLE'],
    ['https://shop.com/blogs/journal', 'BLOG'],
    ['https://shop.com/policies/refund-policy', 'POLICY'],
    ['https://shop.com/pages/about-us', 'CONTENT'],
    ['https://shop.com/account/login', 'ACCOUNT'],
    ['https://shop.com/search?q=tee', 'SEARCH'],
  ])('%s is %s', (url, expected) => {
    expect(classifyPageType(url)).toBe(expected);
  });

  it('reads Vietnamese storefront paths too', () => {
    expect(classifyPageType('https://shop.vn/san-pham/ao-thun')).toBe('PRODUCT');
    expect(classifyPageType('https://shop.vn/danh-muc/ao')).toBe('COLLECTION');
    expect(classifyPageType('https://shop.vn/gio-hang')).toBe('CART');
  });

  it('is not defeated by a locale prefix', () => {
    expect(classifyPageType('https://shop.com/en-vn/products/tee')).toBe('PRODUCT');
  });

  it('picks the same representative page for a template on every run', () => {
    const pages = [
      { url: 'https://shop.com/products/a-very-long-product-handle', pageType: 'PRODUCT' as const },
      { url: 'https://shop.com/products/tee', pageType: 'PRODUCT' as const },
      { url: 'https://shop.com/', pageType: 'HOME' as const },
      { url: 'https://shop.com/pages/about', pageType: 'CONTENT' as const },
    ];
    const targets = pickPerfTargets(pages);
    expect(targets).toContainEqual({ template: 'PRODUCT', url: 'https://shop.com/products/tee' });
    expect(targets).toContainEqual({ template: 'HOME', url: 'https://shop.com/' });
    // Content pages are not a measured template — one score per template, and
    // only the templates the requirements name.
    expect(targets.map((t) => t.template)).not.toContain('CONTENT');
    expect(pickPerfTargets(pages)).toEqual(targets);
  });
});

describe('what the storefront is built on', () => {
  it('recognises Shopify and reads the theme out of the page', () => {
    const detection = detectStorefront({
      html: '<script>var Shopify = {}; Shopify.theme = {"name":"Dawn","id":123,"theme_version":"15.3.0"};</script>',
      assetUrls: ['https://cdn.shopify.com/s/files/1/theme.js'],
      cookies: ['_shopify_y'],
    });
    expect(detection.platform).toBe('SHOPIFY');
    expect(detection.themeName).toBe('Dawn');
    expect(detection.themeVersion).toBe('15.3.0');
    expect(detection.confidence).toBeGreaterThanOrEqual(60);
  });

  it('always shows its working', () => {
    const detection = detectStorefront({
      html: '<div class="woocommerce">',
      assetUrls: ['https://shop.com/wp-content/plugins/woocommerce/assets/js/frontend.js'],
    });
    expect(detection.platform).toBe('WOOCOMMERCE');
    expect(detection.signals.length).toBeGreaterThan(0);
    expect(detection.signals.every((s) => s.signal && s.source)).toBe(true);
  });

  it('calls a headless build a custom storefront, whatever theme it claims', () => {
    const detection = detectStorefront({
      html: '<script id="__NEXT_DATA__">{}</script><script>Shopify.theme = {"name":"Dawn"}</script>',
      assetUrls: ['https://cdn.shopify.com/s/files/1/x.js'],
    });
    expect(detection.platform).toBe('SHOPIFY');
    expect(detection.build).toBe('CUSTOM_STOREFRONT');
  });

  it('says UNKNOWN rather than guessing at a page with no signals', () => {
    const detection = detectStorefront({ html: '<html><body>Hello</body></html>' });
    expect(detection.platform).toBe('UNKNOWN');
    expect(detection.confidence).toBe(0);
  });

  it('lists the apps with the asset that gave each away', () => {
    const apps = detectApps({
      html: '<script src="https://static.klaviyo.com/onsite/js/klaviyo.js"></script>',
      assetUrls: [
        'https://static.klaviyo.com/onsite/js/klaviyo.js',
        'https://cdn.judge.me/widget.js',
      ],
    });
    expect(apps.map((a) => a.name)).toEqual(expect.arrayContaining(['Klaviyo', 'Judge.me']));
    expect(apps.every((a) => a.evidence)).toBe(true);
  });
});

const page = (overrides: Partial<PageDocument> = {}): PageDocument => ({
  url: 'https://shop.com/products/tee',
  httpStatus: 200,
  title: 'Linen Tee — Soft, breathable, made in Hanoi',
  metaDescription:
    'A soft linen tee cut for warm weather, sewn in Hanoi from washed European linen and finished by hand.',
  h1: ['Linen Tee'],
  text: 'A soft linen tee cut for warm weather.',
  images: [{ src: 'https://cdn.shop.com/tee.jpg', alt: 'Linen tee, front', loaded: true }],
  links: [{ href: 'https://shop.com/collections/all', text: 'Shop all', status: 200 }],
  consoleErrors: [],
  failedRequests: [],
  ...overrides,
});

describe('the checks that need no judgement', () => {
  it('passes a page with nothing wrong', () => {
    expect(checkPage(page())).toEqual([]);
  });

  it('catches copy that should never have shipped, with the surrounding sentence', () => {
    const findings = checkPage(
      page({ text: 'Our story. Lorem ipsum dolor sit amet, consectetur. Founded in 2019.' }),
    );
    const placeholder = findings.find((f) => f.category === 'PLACEHOLDER_TEXT');
    expect(placeholder).toBeTruthy();
    expect(placeholder?.evidenceText).toContain('Lorem ipsum');
    expect(placeholder?.severity).toBe('HIGH');
  });

  it.each(['undefined', 'NaN', '[object Object]', '{{ product.title }}'])(
    'catches a rendered %s',
    (broken) => {
      const findings = checkPage(page({ text: `Price: ${broken} today only` }));
      expect(findings.some((f) => f.category === 'PLACEHOLDER_TEXT')).toBe(true);
    },
  );

  it('does not cry wolf on legitimate copy', () => {
    const findings = checkPage(
      page({ text: 'Sample Sale this weekend. Test ride any bike in store.' }),
    );
    expect(findings.filter((f) => f.category === 'PLACEHOLDER_TEXT')).toEqual([]);
  });

  it('reports a broken link with the words a shopper would click', () => {
    const findings = checkPage(
      page({
        links: [{ href: 'https://shop.com/collections/gone', text: 'Summer sale', status: 404 }],
      }),
    );
    const broken = findings.find((f) => f.category === 'BROKEN_LINK');
    expect(broken).toMatchObject({ severity: 'HIGH', evidenceText: 'Summer sale' });
    expect(broken?.evidenceContext).toMatchObject({
      href: 'https://shop.com/collections/gone',
      status: 404,
    });
  });

  it('groups missing alt text into one finding rather than forty', () => {
    const images = Array.from({ length: 40 }, (_, i) => ({
      src: `https://cdn.shop.com/${i}.jpg`,
      alt: '',
      loaded: true,
    }));
    const findings = checkPage(page({ images }));
    const alt = findings.filter((f) => f.category === 'MISSING_ALT');
    expect(alt).toHaveLength(1);
    expect(alt[0]?.title).toContain('40 images');
  });

  it('reports an image that does not load separately from one that lacks alt text', () => {
    const findings = checkPage(
      page({ images: [{ src: 'https://cdn.shop.com/hero.jpg', alt: 'Hero', loaded: false }] }),
    );
    expect(findings.some((f) => f.category === 'MISSING_IMAGE' && f.severity === 'HIGH')).toBe(
      true,
    );
  });

  it('flags a missing title harder than a long one', () => {
    const missing = checkPage(page({ title: null })).find((f) => f.category === 'META_TITLE');
    const long = checkPage(page({ title: 'x'.repeat(90) })).find(
      (f) => f.category === 'META_TITLE',
    );
    expect(missing?.severity).toBe('HIGH');
    expect(long?.severity).toBe('LOW');
  });

  it('caps console noise instead of filing every repeat', () => {
    const consoleErrors = Array.from({ length: 30 }, (_, i) => ({ message: `Error ${i % 3}` }));
    const findings = checkPage(page({ consoleErrors }));
    expect(findings.filter((f) => f.category === 'CONSOLE_ERROR')).toHaveLength(3);
  });

  it('finds duplicate titles only by looking across the site', () => {
    const findings = checkSite([
      { url: 'https://shop.com/products/a', title: 'Shop', metaDescription: null },
      { url: 'https://shop.com/products/b', title: 'Shop', metaDescription: null },
      { url: 'https://shop.com/products/c', title: 'Different', metaDescription: null },
    ]);
    const duplicates = findings.filter((f) => f.detector === 'meta.title.duplicate');
    expect(duplicates).toHaveLength(2);
    expect(duplicates[0]?.evidenceContext).toMatchObject({
      sharedWith: ['https://shop.com/products/b'],
    });
  });
});

describe('the same problem tomorrow is the same finding', () => {
  const base = {
    category: 'PLACEHOLDER_TEXT' as const,
    detector: 'content.placeholder',
    url: 'https://shop.com/about',
  };

  it('is stable across runs', () => {
    expect(fingerprint({ ...base, evidenceText: 'Lorem ipsum dolor' })).toBe(
      fingerprint({ ...base, evidenceText: 'Lorem ipsum dolor' }),
    );
  });

  it('ignores counts that drift between runs', () => {
    expect(fingerprint({ ...base, evidenceText: '12 images without alt text' })).toBe(
      fingerprint({ ...base, evidenceText: '14 images without alt text' }),
    );
  });

  it('separates the same problem on a different page', () => {
    expect(fingerprint({ ...base, evidenceText: 'Lorem ipsum' })).not.toBe(
      fingerprint({ ...base, url: 'https://shop.com/contact', evidenceText: 'Lorem ipsum' }),
    );
  });

  it('separates different problems on the same page', () => {
    expect(fingerprint({ ...base, evidenceText: 'Lorem ipsum' })).not.toBe(
      fingerprint({ ...base, detector: 'meta.title.missing' }),
    );
  });
});
