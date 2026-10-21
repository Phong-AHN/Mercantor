import { describe, expect, it } from 'vitest';
import { checkTargetFor } from './check-target';

describe('checkTargetFor', () => {
  it('moves a current-store page onto the new store, keeping path and query', () => {
    expect(
      checkTargetFor(
        'https://old-shop.com/products/linen-shirt?variant=2',
        'https://new.myshopline.com',
      ),
    ).toBe('https://new.myshopline.com/products/linen-shirt?variant=2');
  });

  it('uses only the origin of the destination', () => {
    expect(checkTargetFor('https://old-shop.com/cart', 'https://new.myshopline.com/preview/')).toBe(
      'https://new.myshopline.com/cart',
    );
  });

  it('checks a page already on the new store as it is', () => {
    expect(
      checkTargetFor('https://new.myshopline.com/collections/all', 'https://new.myshopline.com'),
    ).toBe('https://new.myshopline.com/collections/all');
  });

  it('has nothing to check without a destination', () => {
    expect(checkTargetFor('https://old-shop.com/', null)).toBeNull();
    expect(checkTargetFor('https://old-shop.com/', 'not a url')).toBeNull();
  });
});
