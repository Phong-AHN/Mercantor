/**
 * Working out what a storefront is built on, from what it serves.
 *
 * This is a SUGGESTION, always. Every result carries the signals it matched on,
 * and the portal shows them next to the answer so an agency reviewer can agree
 * or correct it in one click. A detector that cannot show its work is a
 * detector nobody trusts twice — and a wrong platform silently changes the
 * migration estimate.
 */

export type StorefrontPlatform =
  | 'SHOPIFY'
  | 'SHOPLINE'
  | 'WOOCOMMERCE'
  | 'MAGENTO'
  | 'BIGCOMMERCE'
  | 'WIX'
  | 'SQUARESPACE'
  | 'CUSTOM'
  | 'UNKNOWN';

export type StorefrontBuild =
  'STANDARD_THEME' | 'CUSTOMIZED_THEME' | 'CUSTOM_STOREFRONT' | 'UNKNOWN';

/** What the crawler collected from one page load, in a platform-neutral shape. */
export interface StorefrontSignals {
  html: string;
  /** Response headers, lower-cased keys. */
  headers?: Record<string, string>;
  /** Cookie names seen on the response. Values are never needed or kept. */
  cookies?: readonly string[];
  /** Absolute URLs of every script and stylesheet the page pulled in. */
  assetUrls?: readonly string[];
}

export interface DetectedSignal {
  /** What matched, in words a developer can verify by hand. */
  signal: string;
  /** Where it was found: `html`, `header:x-powered-by`, `cookie`, `asset`. */
  source: string;
}

export interface Detection {
  platform: StorefrontPlatform;
  build: StorefrontBuild;
  themeName: string | null;
  themeVersion: string | null;
  signals: DetectedSignal[];
  /** 0-100. Under 60, the portal should present it as a guess, not an answer. */
  confidence: number;
}

interface PlatformRule {
  platform: StorefrontPlatform;
  /** Each hit adds its weight; the highest total wins. */
  checks: Array<{
    signal: string;
    source: string;
    weight: number;
    test: (s: StorefrontSignals) => boolean;
  }>;
}

const has = (haystack: string | undefined, needle: string) =>
  (haystack ?? '').toLowerCase().includes(needle.toLowerCase());

const anyAsset = (s: StorefrontSignals, needle: string) =>
  (s.assetUrls ?? []).some((url) => url.toLowerCase().includes(needle.toLowerCase()));

const anyCookie = (s: StorefrontSignals, needle: string) =>
  (s.cookies ?? []).some((name) => name.toLowerCase().includes(needle.toLowerCase()));

const PLATFORM_RULES: PlatformRule[] = [
  {
    platform: 'SHOPIFY',
    checks: [
      {
        signal: 'Shopify.theme global',
        source: 'html',
        weight: 40,
        test: (s) => has(s.html, 'Shopify.theme'),
      },
      {
        signal: 'cdn.shopify.com asset',
        source: 'asset',
        weight: 30,
        test: (s) => anyAsset(s, 'cdn.shopify.com'),
      },
      {
        signal: '_shopify_y cookie',
        source: 'cookie',
        weight: 20,
        test: (s) => anyCookie(s, '_shopify'),
      },
      {
        signal: 'x-shopid header',
        source: 'header:x-shopid',
        weight: 25,
        test: (s) => Boolean(s.headers?.['x-shopid']),
      },
    ],
  },
  {
    platform: 'SHOPLINE',
    checks: [
      {
        signal: 'shoplineapp.com asset',
        source: 'asset',
        weight: 35,
        test: (s) => anyAsset(s, 'shoplineapp.com'),
      },
      {
        signal: 'shopline cdn asset',
        source: 'asset',
        weight: 30,
        test: (s) => anyAsset(s, 'shoplinecdn'),
      },
      {
        signal: 'SHOPLINE in generator meta',
        source: 'html',
        weight: 25,
        test: (s) => /generator"?\s*content="[^"]*shopline/i.test(s.html),
      },
    ],
  },
  {
    platform: 'WOOCOMMERCE',
    checks: [
      {
        signal: 'woocommerce body class',
        source: 'html',
        weight: 35,
        test: (s) => /class="[^"]*woocommerce/i.test(s.html),
      },
      {
        signal: 'wp-content/plugins/woocommerce',
        source: 'asset',
        weight: 35,
        test: (s) => anyAsset(s, 'plugins/woocommerce'),
      },
      {
        signal: 'wp-content theme asset',
        source: 'asset',
        weight: 15,
        test: (s) => anyAsset(s, 'wp-content/themes'),
      },
    ],
  },
  {
    platform: 'MAGENTO',
    checks: [
      {
        signal: 'Magento_ requirejs module',
        source: 'html',
        weight: 35,
        test: (s) => has(s.html, 'Magento_'),
      },
      {
        signal: 'static/version asset path',
        source: 'asset',
        weight: 25,
        test: (s) => anyAsset(s, '/static/version'),
      },
      {
        signal: 'X-Magento cache header',
        source: 'header',
        weight: 25,
        test: (s) => Object.keys(s.headers ?? {}).some((h) => h.startsWith('x-magento')),
      },
    ],
  },
  {
    platform: 'BIGCOMMERCE',
    checks: [
      {
        signal: 'cdn11.bigcommerce.com asset',
        source: 'asset',
        weight: 40,
        test: (s) => anyAsset(s, 'bigcommerce.com'),
      },
      {
        signal: 'stencil-utils bundle',
        source: 'html',
        weight: 25,
        test: (s) => has(s.html, 'stencil-utils'),
      },
    ],
  },
  {
    platform: 'WIX',
    checks: [
      {
        signal: 'wixstatic asset',
        source: 'asset',
        weight: 40,
        test: (s) => anyAsset(s, 'wixstatic.com'),
      },
      {
        signal: 'X-Wix-Request-Id header',
        source: 'header',
        weight: 30,
        test: (s) => Boolean(s.headers?.['x-wix-request-id']),
      },
    ],
  },
  {
    platform: 'SQUARESPACE',
    checks: [
      {
        signal: 'squarespace.com asset',
        source: 'asset',
        weight: 40,
        test: (s) => anyAsset(s, 'squarespace.com'),
      },
      {
        signal: 'Squarespace generator meta',
        source: 'html',
        weight: 30,
        test: (s) => /generator"?\s*content="squarespace/i.test(s.html),
      },
    ],
  },
];

/** Theme name and version, where the platform publishes them. */
function detectTheme(
  platform: StorefrontPlatform,
  signals: StorefrontSignals,
): { name: string | null; version: string | null } {
  const { html } = signals;

  if (platform === 'SHOPIFY') {
    // Shopify serializes the theme into the page: Shopify.theme = {"name":"Dawn","theme_store_id":887,...}
    const name = html.match(/Shopify\.theme\s*=\s*\{[^}]*"name"\s*:\s*"([^"]+)"/i)?.[1] ?? null;
    const version =
      html.match(/Shopify\.theme\s*=\s*\{[^}]*"theme_version"\s*:\s*"([^"]+)"/i)?.[1] ?? null;
    return { name, version };
  }

  if (platform === 'WOOCOMMERCE') {
    const name =
      signals.assetUrls
        ?.find((u) => /wp-content\/themes\/([^/]+)/i.test(u))
        ?.match(/wp-content\/themes\/([^/]+)/i)?.[1] ?? null;
    const version =
      signals.assetUrls
        ?.find((u) => /wp-content\/themes\/[^/]+.*?[?&]ver=([^&"']+)/i.test(u))
        ?.match(/[?&]ver=([^&"']+)/i)?.[1] ?? null;
    return { name: name ? name.replace(/[-_]/g, ' ') : null, version };
  }

  const generator = html.match(/<meta[^>]+name="generator"[^>]+content="([^"]+)"/i)?.[1] ?? null;
  return { name: generator, version: null };
}

/**
 * Standard theme, customised theme, or a storefront built from scratch?
 *
 * This is the judgement that decides whether a migration can lift the design
 * across or has to rebuild it, so the rule is deliberately cautious: it claims
 * STANDARD_THEME only when the platform names a theme it recognises AND the
 * page carries little custom script. Anything ambiguous stays UNKNOWN for a
 * person to settle, because an optimistic guess here becomes an optimistic
 * estimate.
 */
export function classifyBuild(
  platform: StorefrontPlatform,
  theme: { name: string | null; version: string | null },
  signals: StorefrontSignals,
): StorefrontBuild {
  if (platform === 'UNKNOWN') return 'UNKNOWN';
  if (platform === 'CUSTOM') return 'CUSTOM_STOREFRONT';

  const assets = signals.assetUrls ?? [];
  const platformHosts = [
    'cdn.shopify.com',
    'shoplineapp.com',
    'shoplinecdn',
    'bigcommerce.com',
    'wixstatic.com',
    'squarespace.com',
  ];
  const firstParty = assets.filter(
    (url) => !platformHosts.some((host) => url.toLowerCase().includes(host)),
  );

  // A headless build serves its markup from a framework, not the platform's
  // template engine — the clearest single tell that the storefront was written
  // rather than themed.
  const headless = /__NEXT_DATA__|__NUXT__|data-reactroot|data-sveltekit/i.test(signals.html);
  if (headless) return 'CUSTOM_STOREFRONT';

  if (!theme.name) return 'UNKNOWN';
  // Custom sections, scripts and app blocks accumulate as first-party assets.
  // A handful is normal on any store; a pile of them is a customised theme.
  return firstParty.length >= 6 ? 'CUSTOMIZED_THEME' : 'STANDARD_THEME';
}

export function detectStorefront(signals: StorefrontSignals): Detection {
  let best: { platform: StorefrontPlatform; score: number; matched: DetectedSignal[] } = {
    platform: 'UNKNOWN',
    score: 0,
    matched: [],
  };

  for (const rule of PLATFORM_RULES) {
    const matched: DetectedSignal[] = [];
    let score = 0;
    for (const check of rule.checks) {
      if (!check.test(signals)) continue;
      score += check.weight;
      matched.push({ signal: check.signal, source: check.source });
    }
    if (score > best.score) best = { platform: rule.platform, score, matched };
  }

  // Nothing recognised it, but it is clearly a shop built by somebody: say so
  // rather than UNKNOWN, which reads as "we did not look".
  if (best.score === 0) {
    const looksBespoke = /add to cart|add to bag|checkout/i.test(signals.html);
    if (looksBespoke) {
      return {
        platform: 'CUSTOM',
        build: 'CUSTOM_STOREFRONT',
        themeName: null,
        themeVersion: null,
        signals: [{ signal: 'cart wording with no known platform fingerprint', source: 'html' }],
        confidence: 30,
      };
    }
    return {
      platform: 'UNKNOWN',
      build: 'UNKNOWN',
      themeName: null,
      themeVersion: null,
      signals: [],
      confidence: 0,
    };
  }

  const theme = detectTheme(best.platform, signals);
  return {
    platform: best.platform,
    build: classifyBuild(best.platform, theme, signals),
    themeName: theme.name,
    themeVersion: theme.version,
    signals: best.matched,
    confidence: Math.min(100, best.score),
  };
}

/**
 * Third-party apps and services loaded by the storefront.
 *
 * Reported with the asset that gave them away, because "Klaviyo is installed"
 * is a claim a developer will want to check before it reaches a migration plan.
 */
const APP_SIGNATURES: Array<{ name: string; match: RegExp }> = [
  { name: 'Klaviyo', match: /klaviyo/i },
  { name: 'Yotpo', match: /yotpo/i },
  { name: 'Judge.me', match: /judge\.me|judgeme/i },
  { name: 'Loox', match: /loox\.io/i },
  { name: 'Gorgias', match: /gorgias/i },
  { name: 'Zendesk', match: /zendesk|zdassets/i },
  { name: 'Intercom', match: /intercom(cdn|\.io)/i },
  { name: 'Tidio', match: /tidio/i },
  { name: 'Recharge', match: /rechargepayments|recharge-/i },
  { name: 'Bold', match: /boldapps|bold-/i },
  { name: 'Google Analytics', match: /googletagmanager|google-analytics/i },
  { name: 'Meta Pixel', match: /connect\.facebook\.net/i },
  { name: 'TikTok Pixel', match: /analytics\.tiktok\.com/i },
  { name: 'Hotjar', match: /hotjar/i },
  { name: 'Attentive', match: /attentivemobile/i },
  { name: 'Privy', match: /privy/i },
  { name: 'PageFly', match: /pagefly/i },
  { name: 'Shogun', match: /getshogun|shogun/i },
  { name: 'Algolia', match: /algolia/i },
  { name: 'Searchanise', match: /searchanise/i },
  { name: 'Stamped', match: /stamped\.io/i },
  { name: 'Okendo', match: /okendo/i },
  { name: 'Smile.io', match: /smile\.io/i },
];

export function detectApps(signals: StorefrontSignals): Array<{ name: string; evidence: string }> {
  const haystack = [signals.html, ...(signals.assetUrls ?? [])].join('\n');
  const found: Array<{ name: string; evidence: string }> = [];
  for (const app of APP_SIGNATURES) {
    const line = (signals.assetUrls ?? []).find((url) => app.match.test(url));
    if (line) {
      found.push({ name: app.name, evidence: line });
      continue;
    }
    if (app.match.test(haystack))
      found.push({ name: app.name, evidence: 'referenced in page HTML' });
  }
  return found;
}
