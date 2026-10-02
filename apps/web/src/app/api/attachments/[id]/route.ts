import { NextResponse } from 'next/server';
import { db } from '@relay/db';
import { NotFoundError, toAppError } from '@relay/core';
import { readableVisibilities } from '@relay/rbac';
import { presignDownload, readObject } from '@relay/storage';
import { resolveProject } from '@/features/projects/mutations';
import { requirePrincipal } from '@/server/session';

/**
 * The only place a storage key ever leaves the server. `Attachment.url`
 * points here, never at the bucket directly, so access stays RBAC-gated and
 * the key itself - which a raw S3 URL would expose - never reaches the
 * client. `resolveProject` is the same scope check every other read goes
 * through: a merchant cannot fetch a file from a project they cannot see,
 * even with a guessed attachment id.
 *
 * That alone is not enough for a file attached to a comment: D-009's whole
 * point is that an `INTERNAL_AHN` note's contents never reach SHOPLINE or
 * the merchant, and D-043 #3 already fixed the activity feed leaking that a
 * file existed - but this route still only checked project membership, so
 * the file itself was reachable by anyone who ever saw the direct link
 * (pasted elsewhere, browser history, a server log), regardless of who
 * could read the comment it hangs off. Same predicate D-009 already uses
 * for the comment thread itself, applied here too.
 *
 * `?inline=1` serves an image's bytes from this origin instead of
 * redirecting, so a comment can show it as a thumbnail: the app's CSP is
 * `img-src 'self'`, and an `<img>` cannot follow a redirect to the bucket.
 * Only the raster image types qualify - their stored type was checked
 * against the real bytes on upload - and everything else still redirects,
 * so no other file type is ever rendered by the browser on this origin.
 */
const INLINE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const principal = await requirePrincipal();
    const { id } = await context.params;

    const attachment = await db.attachment.findUnique({
      where: { id },
      select: {
        kind: true,
        label: true,
        storageKey: true,
        mimeType: true,
        project: { select: { code: true } },
        comment: { select: { visibility: true } },
      },
    });
    if (!attachment || attachment.kind !== 'FILE' || !attachment.storageKey) {
      throw new NotFoundError('That file does not exist.');
    }
    if (
      attachment.comment &&
      !readableVisibilities(principal).includes(attachment.comment.visibility)
    ) {
      throw new NotFoundError('That file does not exist.');
    }

    await resolveProject(principal, attachment.project.code);

    const inline = new URL(request.url).searchParams.get('inline') === '1';
    if (inline && attachment.mimeType && INLINE_TYPES.has(attachment.mimeType)) {
      const object = await readObject(attachment.storageKey);
      if (!object) throw new NotFoundError('That file does not exist.');
      return new Response(object.body, {
        headers: {
          'Content-Type': attachment.mimeType,
          ...(object.sizeBytes ? { 'Content-Length': String(object.sizeBytes) } : {}),
          'Content-Disposition': 'inline',
          'X-Content-Type-Options': 'nosniff',
          // A storage key is never reused for different bytes, so the
          // image under this id never changes.
          'Cache-Control': 'private, max-age=86400, immutable',
        },
      });
    }

    const url = await presignDownload(attachment.storageKey, attachment.label);
    return NextResponse.redirect(url);
  } catch (error) {
    const appError = toAppError(error);
    return NextResponse.json(appError.toJSON(), { status: appError.status });
  }
}
