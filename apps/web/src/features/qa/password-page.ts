import { parseAttributes } from './html';

/**
 * Recognising and reading a storefront password page. Pure - no network, no
 * secrets - so the fetcher and the tests can use it freely.
 */

export interface PasswordForm {
  action: string;
  method: 'GET' | 'POST';
  /** Hidden fields to send back as they are (form type, CSRF token, utf8...). */
  fields: Record<string, string>;
  passwordField: string;
}

/**
 * The storefront-password form on a page, or null when there is none.
 *
 * A password page can also carry a customer-login form (a theme's account
 * drawer), so the storefront one is preferred: a form posting to `/password`
 * or marked `form_type=storefront_password`. Only when neither exists does
 * the first form with a password field stand in.
 */
export function parsePasswordForm(html: string, pageUrl: string): PasswordForm | null {
  const candidates: Array<PasswordForm & { storefront: boolean }> = [];
  for (const match of html.matchAll(/<form\b[^>]*>[\s\S]*?<\/form>/gi)) {
    const form = match[0];
    const inputs = [...form.matchAll(/<input\b[^>]*>/gi)].map((input) => parseAttributes(input[0]));
    const password = inputs.find((input) => (input.type ?? '').toLowerCase() === 'password');
    if (!password?.name) continue;

    const attributes = parseAttributes(/^<form\b[^>]*>/i.exec(form)![0]);
    let action: string;
    try {
      action = new URL(attributes.action || pageUrl, pageUrl).toString();
    } catch {
      continue;
    }
    const fields: Record<string, string> = {};
    for (const input of inputs) {
      const type = (input.type ?? 'text').toLowerCase();
      if (!input.name || input === password) continue;
      if (type === 'hidden') fields[input.name] = input.value ?? '';
    }
    candidates.push({
      action,
      method: (attributes.method ?? 'post').toUpperCase() === 'GET' ? 'GET' : 'POST',
      fields,
      passwordField: password.name,
      storefront:
        /\/password\/?$/i.test(new URL(action).pathname) ||
        fields.form_type === 'storefront_password',
    });
  }
  const chosen = candidates.find((candidate) => candidate.storefront) ?? candidates[0];
  if (!chosen) return null;
  const { storefront: _storefront, ...form } = chosen;
  return form;
}

/** A storefront password page: the platforms' `/password` path, or a page that is essentially just that form. */
export function isPasswordPage(url: string, html: string): boolean {
  let path = '';
  try {
    path = new URL(url).pathname;
  } catch {
    return false;
  }
  if (/^\/password\/?$/i.test(path)) return true;
  return (
    /<form\b[^>]*action=["'][^"']*\/password["'?]/i.test(html) && /type=["']?password/i.test(html)
  );
}
