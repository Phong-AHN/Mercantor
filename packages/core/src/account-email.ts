import { escapeHtml, type RenderedEmail } from './email-format';

/**
 * Both emails hand someone a one-time link that ends at the same
 * `/set-password` page - `INVITE` for the first password anyone ever sets on
 * a new account, `RESET` for a forgotten one. Kept as two render functions
 * rather than one parameterised by purpose because the two need to read
 * differently: an invite is an introduction ("you now have an account"), a
 * reset is a response to something the recipient asked for.
 */
export interface AccountInviteEmailInput {
  recipientName: string;
  /** Who is behind the invite - "AHN Media" or a specific person's name. */
  invitedBy: string;
  /** Absolute URL to `/set-password?token=...`. */
  setPasswordUrl: string;
}

export function renderAccountInviteEmail(input: AccountInviteEmailInput): RenderedEmail {
  const subject = `${input.invitedBy} invited you to Mercantor`;

  const text = [
    `Hi ${input.recipientName},`,
    '',
    `${input.invitedBy} has set up an account for you on Mercantor, the migration portal.`,
    '',
    `Set your password to get started: ${input.setPasswordUrl}`,
    '',
    'This link works once and expires in 7 days.',
  ].join('\n');

  const html = `
<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;color:#0f172a;max-width:560px">
  <p>Hi ${escapeHtml(input.recipientName)},</p>
  <p><strong>${escapeHtml(input.invitedBy)}</strong> has set up an account for you on Mercantor, the migration portal.</p>
  <a href="${escapeHtml(input.setPasswordUrl)}" style="display:inline-block;margin-top:16px;padding:9px 16px;background:#0f172a;color:#fff;border-radius:8px;text-decoration:none;font-weight:600">Set your password</a>
  <p style="margin-top:28px;color:#94a3b8;font-size:12px">This link works once and expires in 7 days. If you were not expecting this, you can ignore it.</p>
</div>`.trim();

  return { subject, text, html };
}

export interface PasswordResetEmailInput {
  recipientName: string;
  /** Absolute URL to `/set-password?token=...`. */
  resetUrl: string;
}

export function renderPasswordResetEmail(input: PasswordResetEmailInput): RenderedEmail {
  const subject = 'Reset your Mercantor password';

  const text = [
    `Hi ${input.recipientName},`,
    '',
    'Someone (hopefully you) asked to reset the password on your Mercantor account.',
    '',
    `Choose a new one: ${input.resetUrl}`,
    '',
    "This link works once and expires in 1 hour. If you didn't request this, you can ignore it - your password will not change.",
  ].join('\n');

  const html = `
<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;color:#0f172a;max-width:560px">
  <p>Hi ${escapeHtml(input.recipientName)},</p>
  <p>Someone (hopefully you) asked to reset the password on your Mercantor account.</p>
  <a href="${escapeHtml(input.resetUrl)}" style="display:inline-block;margin-top:16px;padding:9px 16px;background:#0f172a;color:#fff;border-radius:8px;text-decoration:none;font-weight:600">Choose a new password</a>
  <p style="margin-top:28px;color:#94a3b8;font-size:12px">This link works once and expires in 1 hour. If you didn't request this, you can ignore it - your password will not change.</p>
</div>`.trim();

  return { subject, text, html };
}
