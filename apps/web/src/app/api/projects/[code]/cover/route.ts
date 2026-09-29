import { NextResponse } from 'next/server';
import { clock, ForbiddenError, NotFoundError, toAppError, ValidationError } from '@relay/core';
import { db, transaction } from '@relay/db';
import { assertCan } from '@relay/rbac';
import {
  deleteObject,
  deriveAttachmentKey,
  putObject,
  readObject,
  sniffMimeType,
} from '@relay/storage';
import { resolveProject, revalidateProject } from '@/features/projects/mutations';
import { audit } from '@/server/record';
import { requestMeta, requirePrincipal } from '@/server/session';

/**
 * The project hero's cover image.
 *
 * A route handler rather than a server action: an image is bigger than a
 * server action's 1 MB body limit, and the browser cannot upload straight to
 * the bucket because the app's CSP is `connect-src 'self'`. The browser
 * shrinks the image first (see cover-controls.tsx), so bodies stay small.
 *
 * Unlike a server action, a route handler gets no built-in origin check, so
 * the mutating methods refuse any request whose Origin is not this site.
 */

const MAX_BYTES = 5 * 1024 * 1024;
const ACCEPTED: Record<string, string> = {
  'image/webp': 'webp',
  'image/jpeg': 'jpg',
  'image/png': 'png',
};

function assertSameOrigin(request: Request): void {
  const origin = request.headers.get('origin');
  const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host');
  if (!origin || !host || new URL(origin).host !== host) {
    throw new ForbiddenError('Cross-site requests are not accepted.');
  }
}

function fail(error: unknown) {
  const appError = toAppError(error);
  return NextResponse.json(appError.toJSON(), { status: appError.status });
}

export async function GET(_request: Request, context: { params: Promise<{ code: string }> }) {
  try {
    const principal = await requirePrincipal();
    const { code } = await context.params;
    const project = await resolveProject(principal, code);
    const row = await db.project.findUnique({
      where: { id: project.id },
      select: { coverImageKey: true },
    });
    if (!row?.coverImageKey) throw new NotFoundError('This project has no cover image.');
    const object = await readObject(row.coverImageKey);
    if (!object) throw new NotFoundError('This project has no cover image.');
    return new Response(object.body, {
      headers: {
        'Content-Type': object.contentType ?? 'image/webp',
        ...(object.sizeBytes ? { 'Content-Length': String(object.sizeBytes) } : {}),
        // The URL carries ?v=<updatedAt>, so a new cover is a new URL.
        'Cache-Control': 'private, max-age=86400, immutable',
      },
    });
  } catch (error) {
    return fail(error);
  }
}

export async function POST(request: Request, context: { params: Promise<{ code: string }> }) {
  try {
    assertSameOrigin(request);
    const principal = await requirePrincipal();
    assertCan(principal, 'project:update', { action: 'project.cover.upload' });
    const { code } = await context.params;
    const project = await resolveProject(principal, code);

    const form = await request.formData();
    const file = form.get('file');
    if (!(file instanceof File)) throw new ValidationError('Choose an image to upload.');
    if (file.size === 0 || file.size > MAX_BYTES) {
      throw new ValidationError('The image must be smaller than 5 MB.');
    }
    const bytes = Buffer.from(await file.arrayBuffer());
    // The declared type is not trusted: the bytes decide.
    const sniffed = sniffMimeType(bytes.subarray(0, 4100));
    const extension = sniffed ? ACCEPTED[sniffed] : undefined;
    if (!sniffed || !extension) {
      throw new ValidationError('Covers must be PNG, JPEG or WebP images.');
    }

    const { key } = deriveAttachmentKey({ projectId: project.id, extension });
    await putObject({ key, body: bytes, contentType: sniffed });

    const meta = await requestMeta();
    const previous = await transaction(async (tx) => {
      const before = await tx.project.findUnique({
        where: { id: project.id },
        select: { coverImageKey: true },
      });
      await tx.project.update({
        where: { id: project.id },
        data: { coverImageKey: key, coverImageUpdatedAt: clock.now() },
      });
      await audit(tx, {
        principal,
        projectId: project.id,
        action: 'project.cover.upload',
        entityType: 'Project',
        entityId: project.id,
        after: { sizeBytes: bytes.byteLength, mimeType: sniffed },
        ip: meta.ip,
      });
      return before?.coverImageKey ?? null;
    });
    if (previous) await deleteObject(previous).catch(() => undefined);

    revalidateProject(code);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return fail(error);
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ code: string }> }) {
  try {
    assertSameOrigin(request);
    const principal = await requirePrincipal();
    assertCan(principal, 'project:update', { action: 'project.cover.remove' });
    const { code } = await context.params;
    const project = await resolveProject(principal, code);
    const meta = await requestMeta();

    const previous = await transaction(async (tx) => {
      const before = await tx.project.findUnique({
        where: { id: project.id },
        select: { coverImageKey: true },
      });
      if (!before?.coverImageKey) return null;
      await tx.project.update({
        where: { id: project.id },
        data: { coverImageKey: null, coverImageUpdatedAt: clock.now() },
      });
      await audit(tx, {
        principal,
        projectId: project.id,
        action: 'project.cover.remove',
        entityType: 'Project',
        entityId: project.id,
        ip: meta.ip,
      });
      return before.coverImageKey;
    });
    if (previous) await deleteObject(previous).catch(() => undefined);

    revalidateProject(code);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return fail(error);
  }
}
