import { NextResponse } from 'next/server';
import { db } from '@relay/db';
import { NotFoundError, toAppError } from '@relay/core';
import { presignDownload } from '@relay/storage';
import { resolveProject } from '@/features/projects/mutations';
import { requirePrincipal } from '@/server/session';

/**
 * The only place a storage key ever leaves the server. `Attachment.url`
 * points here, never at the bucket directly, so access stays RBAC-gated and
 * the key itself - which a raw S3 URL would expose - never reaches the
 * client. `resolveProject` is the same scope check every other read goes
 * through: a merchant cannot fetch a file from a project they cannot see,
 * even with a guessed attachment id.
 */
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const principal = await requirePrincipal();
    const { id } = await context.params;

    const attachment = await db.attachment.findUnique({
      where: { id },
      select: {
        kind: true,
        label: true,
        storageKey: true,
        project: { select: { code: true } },
      },
    });
    if (!attachment || attachment.kind !== 'FILE' || !attachment.storageKey) {
      throw new NotFoundError('That file does not exist.');
    }

    await resolveProject(principal, attachment.project.code);

    const url = await presignDownload(attachment.storageKey, attachment.label);
    return NextResponse.redirect(url);
  } catch (error) {
    const appError = toAppError(error);
    return NextResponse.json(appError.toJSON(), { status: appError.status });
  }
}
