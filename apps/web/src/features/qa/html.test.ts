import { describe, expect, it } from 'vitest';
import { allowedHostsFor, isPublicAddress } from './fetch-page';
import { extractDocument, measureHtml, parseAttributes } from './html';

const PAGE = `<!doctype html><html><head>
<title>Linen Shirt &amp; Co</title>
<meta name="description" content="A shirt.">
<link rel="stylesheet" href="/assets/theme.css">
<script src="https://cdn.shopify.com/s/files/theme.js"></script>
<script src="https://www.googletagmanager.com/gtm.js"></script>
<!-- <script src="https://ignored.example/x.js"></script> -->
</head><body>
<header><nav>Lorem ipsum menu</nav></header>
<h1>Linen <em>shirt</em></h1>
<p>Breathable linen. {{ product.price | money }}</p>
<img src="/a.jpg" alt="Front">
<img src="/b.jpg">
<img data-src="https://cdn.shopify.com/c.jpg" alt="">
<a href="/collections/all">All</a>
<a href="mailto:x@y.z">Mail</a>
<footer>© Shop</footer>
</body></html>`;

describe('extractDocument', () => {
  const doc = extractDocument(PAGE, 'https://shop.example.com/products/linen', 200);

  it('reads title, description and headings', () => {
    expect(doc.title).toBe('Linen Shirt & Co');
    expect(doc.metaDescription).toBe('A shirt.');
    expect(doc.h1).toEqual(['Linen shirt']);
  });

  it('keeps an absent alt apart from an empty one', () => {
    expect(doc.images.map((image) => image.alt)).toEqual(['Front', null, '']);
    expect(doc.images[0]!.src).toBe('https://shop.example.com/a.jpg');
  });

  it('drops navigation and footer copy, keeps the body', () => {
    expect(doc.text).not.toContain('Lorem ipsum');
    expect(doc.text).toContain('{{ product.price | money }}');
  });

  it('keeps only http links, resolved', () => {
    expect(doc.links).toEqual([{ href: 'https://shop.example.com/collections/all', text: 'All' }]);
  });
});

describe('measureHtml', () => {
  it('counts referenced resources and third-party hosts, ignoring comments', () => {
    const m = measureHtml(PAGE, 'https://shop.example.com/products/linen', 1234);
    expect(m.scriptCount).toBe(2);
    expect(m.stylesheetCount).toBe(1);
    expect(m.imageCount).toBe(3);
    expect(m.resourceCount).toBe(1 + 2 + 1 + 3);
    expect(m.thirdPartyHosts).toEqual(['cdn.shopify.com', 'www.googletagmanager.com']);
    expect(m.htmlBytes).toBe(1234);
  });
});

describe('parseAttributes', () => {
  it('handles quoting styles and bare attributes', () => {
    expect(parseAttributes(`<img src='a.png' alt="x &quot;y&quot;" hidden data-x=1>`)).toEqual({
      src: 'a.png',
      alt: 'x "y"',
      hidden: '',
      'data-x': '1',
    });
  });
});

describe('isPublicAddress', () => {
  it.each([
    ['127.0.0.1', false],
    ['10.1.2.3', false],
    ['172.20.0.1', false],
    ['192.168.1.1', false],
    ['169.254.169.254', false],
    ['100.64.0.1', false],
    ['0.0.0.0', false],
    ['::1', false],
    ['fd00::1', false],
    ['fe80::1', false],
    ['::ffff:127.0.0.1', false],
    ['8.8.8.8', true],
    ['23.227.38.65', true],
    ['2606:4700::6810:84e5', true],
  ])('%s -> %s', (address, expected) => {
    expect(isPublicAddress(address)).toBe(expected);
  });
});

describe('allowedHostsFor', () => {
  it('adds the www twin and skips blanks', () => {
    expect(allowedHostsFor(['https://Shop.com/x', null, 'not a url']).sort()).toEqual([
      'shop.com',
      'www.shop.com',
    ]);
  });
});
