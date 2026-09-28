import { NextResponse } from 'next/server';
import { db } from '@relay/db';
import { NotFoundError, toAppError } from '@relay/core';
import { assertCan, isConfinedToOwnProjects } from '@relay/rbac';
import { presignDownload } from '@relay/storage';
import { resolveProject } from '@/features/projects/mutations';
import { requirePrincipal } from '@/server/session';

/**
 * Serves a before/after screenshot. Like `/api/attachments/[id]`, the storage
 * key never leaves the server and project scope is checked on every request.
 * A merchant additionally only sees captures that are part of a comparison
 * someone shared with them - an internal work-in-progress capture stays
 * internal even if its id leaks.
 *
 * No Content-Disposition, so the image renders inline in an <img>.
 */
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const principal = await requirePrincipal();
    assertCan(principal, 'qa:read', { action: 'qa.capture.read' });
    const { id } = await context.params;

    const capture = await db.pageCapture.findUnique({
      where: { id },
      select: {
        storageKey: true,
        project: { select: { code: true } },
        comparisonsAsBefore: { where: { clientVisibleAt: { not: null } }, select: { id: true } },
        comparisonsAsAfter: { where: { clientVisibleAt: { not: null } }, select: { id: true } },
      },
    });
    if (!capture) throw new NotFoundError('That capture does not exist.');
    if (
      isConfinedToOwnProjects(principal) &&
      capture.comparisonsAsBefore.length === 0 &&
      capture.comparisonsAsAfter.length === 0
    ) {
      throw new NotFoundError('That capture does not exist.');
    }

    await resolveProject(principal, capture.project.code);

    const url = await presignDownload(capture.storageKey);
    const response = NextResponse.redirect(url);
    response.headers.set('Cache-Control', 'private, max-age=300');
    return response;
  } catch (error) {
    const appError = toAppError(error);
    return NextResponse.json(appError.toJSON(), { status: appError.status });
  }
}
