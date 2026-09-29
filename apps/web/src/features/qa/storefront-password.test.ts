import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('node:dns/promises', () => ({
  lookup: vi.fn(async () => [{ address: '23.227.38.65', family: 4 }]),
}));

import { fetchStorefrontPage, PasswordRequired } from './fetch-page';
import { isPasswordPage, parsePasswordForm } from './password-page';

const SHOP = 'https://preview-shop.example.com';
const PASSWORD_PAGE = `<!doctype html><html><body>
<header><form action="/account/login" method="post"><input type="email" name="customer[email]"><input type="password" name="customer[password]"></form></header>
<form method="post" action="/password" id="login_form" accept-charset="UTF-8" class="storefront-password-form">
  <input type="hidden" name="form_type" value="storefront_password" />
  <input type="hidden" name="utf8" value="✓" />
  <input type="password" name="password" id="Password" autocomplete="current-password">
  <button type="submit">Enter</button>
</form></body></html>`;

describe('parsePasswordForm', () => {
  it('picks the storefront password form over an account-login form that comes first', () => {
    const form = parsePasswordForm(PASSWORD_PAGE, `${SHOP}/password`);
    expect(form).toEqual({
      action: `${SHOP}/password`,
      method: 'POST',
      fields: { form_type: 'storefront_password', utf8: '✓' },
      passwordField: 'password',
    });
  });

  it('returns null when there is no password field', () => {
    expect(parsePasswordForm('<form action="/search"><input name="q"></form>', SHOP)).toBeNull();
  });
});

describe('isPasswordPage', () => {
  it('recognises the /password page and a page carrying the storefront password form', () => {
    expect(isPasswordPage(`${SHOP}/password`, '')).toBe(true);
    expect(isPasswordPage(`${SHOP}/`, PASSWORD_PAGE)).toBe(true);
  });

  it('does not mistake a normal page with an account login for the password page', () => {
    expect(
      isPasswordPage(
        `${SHOP}/collections/all`,
        '<form action="/account/login"><input type="password" name="customer[password]"></form>',
      ),
    ).toBe(false);
  });
});

describe('passwordFor and encryption', () => {
  beforeAll(() => {
    vi.stubEnv('SKIP_ENV_VALIDATION', 'true');
  });

  it('picks the password for the host being checked and round-trips encryption', async () => {
    const { encryptStorefrontPassword, passwordFor } = await import('./storefront-auth');
    const profile = {
      storefrontUrl: 'https://oldshop.com',
      destinationUrl: SHOP,
      storefrontPasswordEnc: encryptStorefrontPassword('old-secret'),
      destinationPasswordEnc: encryptStorefrontPassword('new-secret'),
    };
    expect(profile.destinationPasswordEnc).not.toContain('new-secret');
    expect(passwordFor(`${SHOP}/products/a`, profile)).toBe('new-secret');
    expect(passwordFor('https://www.oldshop.com/cart', profile)).toBe('old-secret');
    expect(passwordFor('https://elsewhere.com/', profile)).toBeUndefined();
    expect(passwordFor(SHOP, { ...profile, destinationPasswordEnc: 'garbage' })).toBeUndefined();
  });
});

describe('fetchStorefrontPage behind a password page', () => {
  afterEach(() => vi.unstubAllGlobals());

  function storefront(acceptedPassword: string) {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const fetchMock = vi.fn(async (input: URL | string, init: RequestInit = {}) => {
      const url = new URL(String(input));
      calls.push({ url: url.toString(), init });
      const cookie = new Headers(init.headers).get('cookie') ?? '';
      if (init.method === 'POST' && url.pathname === '/password') {
        const body = new URLSearchParams(String(init.body));
        const headers = new Headers({ location: '/' });
        if (
          body.get('password') === acceptedPassword &&
          body.get('form_type') === 'storefront_password'
        ) {
          headers.append('set-cookie', 'storefront_digest=ok123; path=/; HttpOnly');
        }
        return new Response(null, { status: 302, headers });
      }
      if (url.pathname === '/password') {
        return new Response(PASSWORD_PAGE.replace(/<header>[\s\S]*<\/header>/, ''), {
          status: 200,
        });
      }
      if (!cookie.includes('storefront_digest=ok123')) {
        return new Response(null, { status: 302, headers: { location: '/password' } });
      }
      return new Response('<html><title>Welcome to the store</title><body>Products</body></html>', {
        status: 200,
      });
    });
    vi.stubGlobal('fetch', fetchMock);
    return calls;
  }

  const options = { allowedHosts: ['preview-shop.example.com'], device: 'DESKTOP' as const };

  it('logs in with the saved password and returns the real page', async () => {
    const calls = storefront('hunter2');
    const page = await fetchStorefrontPage(`${SHOP}/`, { ...options, password: 'hunter2' });
    expect(page.status).toBe(200);
    expect(page.html).toContain('Welcome to the store');
    const post = calls.find((call) => call.init.method === 'POST');
    expect(String(post?.init.body)).toContain('password=hunter2');
    expect(new Headers(calls.at(-1)!.init.headers).get('cookie')).toContain(
      'storefront_digest=ok123',
    );
  });

  it('says the password is missing when none is saved', async () => {
    storefront('hunter2');
    await expect(fetchStorefrontPage(`${SHOP}/`, options)).rejects.toBeInstanceOf(PasswordRequired);
  });

  it('says the password was not accepted when it is wrong', async () => {
    storefront('hunter2');
    await expect(
      fetchStorefrontPage(`${SHOP}/`, { ...options, password: 'wrong' }),
    ).rejects.toThrow(/not accepted/);
  });
});
