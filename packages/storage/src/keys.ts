import { randomUUID } from 'node:crypto';
import { clock } from '@relay/core';

/**
 * `project/{projectId}/{yyyy}/{mm}/{assetId}.{ext}`
 *
 * The key encodes the project, which makes a leak auditable from the key
 * alone, and the object name is a generated id plus a validated extension -
 * never the filename a user typed. That is what prevents path traversal and
 * a disguised executable riding in on a trusted-looking name.
 */
export function deriveAttachmentKey(input: { projectId: string; extension: string }): {
  key: string;
  assetId: string;
} {
  const assetId = randomUUID();
  const now = clock.now();
  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
  const key = `project/${input.projectId}/${yyyy}/${mm}/${assetId}.${input.extension}`;
  return { key, assetId };
}

/**
 * `bank-import/{organizationId}/{yyyy}/{mm}/{screenshotId}.{ext}` - a bank
 * transaction screenshot is organization-scoped, not project-scoped (most
 * imported rows have no project on the other end at all), so this keys off
 * the organization the same way `deriveAttachmentKey` keys off the project.
 */
export function deriveBankImportKey(input: { organizationId: string; extension: string }): {
  key: string;
  screenshotId: string;
} {
  const screenshotId = randomUUID();
  const now = clock.now();
  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
  const key = `bank-import/${input.organizationId}/${yyyy}/${mm}/${screenshotId}.${input.extension}`;
  return { key, screenshotId };
}
