import type { MigrationType } from './enums';
import { escapeHtml, type RenderedEmail } from './email-format';
import { MIGRATION_TYPE_LABEL } from './labels';

/**
 * The standardised introduction. SHOPLINE picks the merchant contact and
 * presses one button; everything below is filled from the project record, so
 * two account managers cannot introduce the same product two different ways.
 */
export interface IntroEmailInput {
  merchantName: string;
  merchantContactName: string;
  merchantWebsite: string | null;
  currentPlatform: string | null;
  shoplineStoreId: string | null;
  migrationType: MigrationType;
  targetLaunchDate: Date | null;
  shoplineContactName: string;
  shoplineContactEmail: string;
  ahnContactName: string;
  ahnContactEmail: string;
  projectUrl: string;
  /** Blocking access items, so the merchant knows what to prepare. */
  requiredAccess: readonly string[];
  nextSteps?: readonly string[];
}

const DEFAULT_NEXT_STEPS = [
  'Reply to this thread to confirm the primary contact for the migration.',
  'AHN will send a kickoff invitation within one business day.',
  'Grant the access listed below so migration can begin without delay.',
  'Upload brand assets and the approved redirect map in the project portal.',
];

function formatDateLine(date: Date | null): string {
  if (!date) return 'to be confirmed at kickoff';
  return date.toISOString().slice(0, 10);
}

export function renderIntroductionEmail(input: IntroEmailInput): RenderedEmail {
  const steps = input.nextSteps ?? DEFAULT_NEXT_STEPS;
  const migration = MIGRATION_TYPE_LABEL[input.migrationType].label;

  const subject = `${input.merchantName} x SHOPLINE - migration kickoff with AHN Media`;

  const lines: string[] = [
    `Hi ${input.merchantContactName},`,
    '',
    `Thank you for choosing SHOPLINE. I am connecting you with AHN Media, our migration partner, who will move ${input.merchantName} onto SHOPLINE and take it live.`,
    '',
    'PROJECT SUMMARY',
    `  Merchant:            ${input.merchantName}${input.merchantWebsite ? ` (${input.merchantWebsite})` : ''}`,
    `  Current platform:    ${input.currentPlatform ?? 'to be confirmed'}`,
    `  SHOPLINE store ID:   ${input.shoplineStoreId ?? 'to be provisioned'}`,
    `  Migration type:      ${migration}`,
    `  Target launch:       ${formatDateLine(input.targetLaunchDate)}`,
    '',
    'WHO IS WHO',
    `  SHOPLINE:  ${input.shoplineContactName} <${input.shoplineContactEmail}>`,
    `  AHN Media: ${input.ahnContactName} <${input.ahnContactEmail}>`,
    '',
    'NEXT STEPS',
    ...steps.map((step, index) => `  ${index + 1}. ${step}`),
    '',
    'ACCESS REQUIRED TO START',
    ...(input.requiredAccess.length > 0
      ? input.requiredAccess.map((item) => `  - ${item}`)
      : ['  - Will be confirmed at kickoff.']),
    '',
    'PROJECT PORTAL',
    `  Live status, blockers, approvals and timeline: ${input.projectUrl}`,
    '  Everything about this migration lives there - please use it rather than email threads.',
    '',
    'Best regards,',
    input.shoplineContactName,
    'SHOPLINE',
  ];

  const text = lines.join('\n');

  const html = `
<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;color:#0f172a;max-width:640px">
  <p>Hi ${escapeHtml(input.merchantContactName)},</p>
  <p>Thank you for choosing SHOPLINE. I am connecting you with <strong>AHN Media</strong>, our migration partner, who will move <strong>${escapeHtml(input.merchantName)}</strong> onto SHOPLINE and take it live.</p>

  <h3 style="margin:24px 0 8px;font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:#64748b">Project summary</h3>
  <table style="border-collapse:collapse;width:100%">
    ${row('Merchant', `${escapeHtml(input.merchantName)}${input.merchantWebsite ? ` &middot; ${escapeHtml(input.merchantWebsite)}` : ''}`)}
    ${row('Current platform', escapeHtml(input.currentPlatform ?? 'To be confirmed'))}
    ${row('SHOPLINE store ID', escapeHtml(input.shoplineStoreId ?? 'To be provisioned'))}
    ${row('Migration type', escapeHtml(migration))}
    ${row('Target launch', escapeHtml(formatDateLine(input.targetLaunchDate)))}
  </table>

  <h3 style="margin:24px 0 8px;font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:#64748b">Who is who</h3>
  <table style="border-collapse:collapse;width:100%">
    ${row('SHOPLINE', `${escapeHtml(input.shoplineContactName)} &lt;${escapeHtml(input.shoplineContactEmail)}&gt;`)}
    ${row('AHN Media', `${escapeHtml(input.ahnContactName)} &lt;${escapeHtml(input.ahnContactEmail)}&gt;`)}
  </table>

  <h3 style="margin:24px 0 8px;font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:#64748b">Next steps</h3>
  <ol style="margin:0;padding-left:20px">${steps.map((step) => `<li>${escapeHtml(step)}</li>`).join('')}</ol>

  <h3 style="margin:24px 0 8px;font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:#64748b">Access required to start</h3>
  <ul style="margin:0;padding-left:20px">${
    input.requiredAccess.length > 0
      ? input.requiredAccess.map((item) => `<li>${escapeHtml(item)}</li>`).join('')
      : '<li>Will be confirmed at kickoff.</li>'
  }</ul>

  <div style="margin:28px 0;padding:16px 20px;background:#f1f5f9;border-radius:12px">
    <div style="font-weight:600;margin-bottom:4px">Project portal</div>
    <div style="color:#475569">Live status, blockers, approvals and timeline in one place.</div>
    <a href="${escapeHtml(input.projectUrl)}" style="display:inline-block;margin-top:10px;padding:9px 16px;background:#0f172a;color:#fff;border-radius:8px;text-decoration:none;font-weight:600">Open the project</a>
  </div>

  <p style="color:#64748b">Best regards,<br/>${escapeHtml(input.shoplineContactName)}<br/>SHOPLINE</p>
</div>`.trim();

  return { subject, text, html };
}

function row(label: string, value: string): string {
  return `<tr><td style="padding:4px 12px 4px 0;color:#64748b;white-space:nowrap">${label}</td><td style="padding:4px 0;font-weight:500">${value}</td></tr>`;
}
