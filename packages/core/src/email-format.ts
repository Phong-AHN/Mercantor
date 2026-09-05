/**
 * Shared by every email template in the package - the introduction and the
 * notification digest both need the same wire shape and the same escaping,
 * and a second copy of `escapeHtml` is exactly the kind of drift that turns
 * into a real XSS gap the day one of the two templates gets edited and the
 * other does not.
 */
export interface RenderedEmail {
  subject: string;
  /** Plain text, because it is what gets pasted into a mail client. */
  text: string;
  html: string;
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
