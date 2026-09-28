import { describe, expect, it } from 'vitest';
import { captureSourceUrl } from './capture-plan';
import { isBlockedSubresource } from './fetch-page';

describe('captureSourceUrl', () => {
  const migration = {
    storefrontUrl: 'https://old-shop.com',
    destinationUrl: 'https://new-shop.myshopline.com/',
  };

  it('takes the before from the current storefront and the after from the new one, same path', () => {
    const page = 'https://old-shop.com/products/linen?variant=2';
    expect(captureSourceUrl(page, 'BEFORE', migration)).toBe('https://old-shop.com/products/linen?variant=2');
    expect(captureSourceUrl(page, 'AFTER', migration)).toBe(
      'https://new-shop.myshopline.com/products/linen?variant=2',
    );
  });

  it('maps a page registered on the new host back to the old one for the before', () => {
    expect(captureSourceUrl('https://new-shop.myshopline.com/cart', 'BEFORE', migration)).toBe(
      'https://old-shop.com/cart',
    );
  });

  it('uses the one URL for both when the redesign stays on the same domain', () => {
    const glowUp = { storefrontUrl: 'https://shop.com', destinationUrl: null };
    expect(captureSourceUrl('https://shop.com/', 'AFTER', glowUp)).toBe('https://shop.com/');
  });
});

describe('isBlockedSubresource', () => {
  it.each([
    ['https://cdn.shopify.com/s/files/a.js', false],
    ['data:image/png;base64,AAAA', false],
    ['http://localhost:6379/', true],
    ['http://metadata.google.internal/', true],
    ['http://169.254.169.254/latest/meta-data', true],
    ['http://10.0.0.5/admin', true],
    ['http://[::1]/', true],
    ['file:///etc/passwd', true],
    ['https://8.8.8.8/', false],
  ])('%s -> %s', (url, blocked) => {
    expect(isBlockedSubresource(url)).toBe(blocked);
  });
});
