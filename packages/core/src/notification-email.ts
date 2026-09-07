import { escapeHtml, type RenderedEmail } from './email-format';

/**
 * The four in-app notification types urgent enough that somebody away from
 * the portal should still hear about them: a launch blocker, an approval
 * only they can decide, a project ready for SHOPLINE review, and a
 * deployment decision. Chosen deliberately narrow - see D-027.
 */
export interface NotificationEmailInput {
  recipientName: string;
  /** The same headline already shown in the app and, where relevant, Slack. */
  title: string;
  body: string | null;
  /** Absolute URL - the caller resolves the stored relative `href` first. */
  projectUrl: string;
}

export function renderNotificationEmail(input: NotificationEmailInput): RenderedEmail {
  const subject = input.title;

  const text = [
    `Hi ${input.recipientName},`,
    '',
    input.title,
    ...(input.body ? ['', input.body] : []),
    '',
    `Open it in the portal: ${input.projectUrl}`,
  ].join('\n');

  const html = `
<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;color:#0f172a;max-width:560px">
  <p>Hi ${escapeHtml(input.recipientName)},</p>
  <p style="font-weight:600;font-size:16px">${escapeHtml(input.title)}</p>
  ${input.body ? `<p style="color:#475569">${escapeHtml(input.body)}</p>` : ''}
  <a href="${escapeHtml(input.projectUrl)}" style="display:inline-block;margin-top:16px;padding:9px 16px;background:#0f172a;color:#fff;border-radius:8px;text-decoration:none;font-weight:600">Open in the portal</a>
  <p style="margin-top:28px;color:#94a3b8;font-size:12px">You are getting this because Mercantor flagged it as needing attention while you might not be looking at the portal.</p>
</div>`.trim();

  return { subject, text, html };
}
