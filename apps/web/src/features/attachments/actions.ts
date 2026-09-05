'use server';

import { z } from 'zod';
import {
  ALLOWED_ATTACHMENT_TYPES,
  MAX_ATTACHMENT_BYTES,
  attachmentTypeFor,
  formatFileSize,
  ConflictError,
  ForbiddenError,
  ValidationError,
} from '@relay/core';
import { transaction } from '@relay/db';
import {
  deleteObject,
  deriveAttachmentKey,
  headObject,
  presignUpload,
  readObjectHead,
  sniffIsConsistentWith,
  sniffMimeType,
} from '@relay/storage';
import { actionOk, defineAction } from '@/server/action';
import { audit, recordActivity } from '@/server/record';
import { resolveProject, revalidateProject } from '@/features/projects/mutations';

/**
 * A file attachment lands in the bucket in two steps, never one:
 *
 *   1. `requestUploadAction`  - RBAC + declared type/size checked, a presigned
 *      POST issued for a server-derived key. The browser then uploads
 *      straight to the bucket; these bytes never pass through this server.
 *   2. `confirmUploadAction`  - the *real* bytes are read back and sniffed
 *      before the `Attachment` row is created. A mismatch deletes the object
 *      and nothing is ever linked to the project.
 *
 * The declared type in step 1 only decides whether the upload is offered at
 * all; the row that other people see is never created on declared type alone.
 */

const targetFields = {
  assetItemId: z.string().uuid().optional(),
  accessItemId: z.string().uuid().optional(),
  issueId: z.string().uuid().optional(),
  commentId: z.string().uuid().optional(),
};

export const requestUploadAction = defineAction({
  name: 'attachment.request_upload',
  permission: ['asset:upload'],
  input: z.object({
    code: z.string().min(1),
    contentType: z.string().min(1),
    sizeBytes: z.coerce.number().int().positive(),
  }),
  async handler(input, ctx) {
    const project = await resolveProject(ctx.principal, input.code);

    const type = attachmentTypeFor(input.contentType);
    if (!type) {
      throw new ValidationError('That file type is not accepted.', {
        contentType: [
          `Accepted types: ${ALLOWED_ATTACHMENT_TYPES.map((entry) => entry.label).join(', ')}.`,
        ],
      });
    }
    if (input.sizeBytes > MAX_ATTACHMENT_BYTES) {
      throw new ValidationError('That file is too large.', {
        sizeBytes: [`Files must be ${formatFileSize(MAX_ATTACHMENT_BYTES)} or smaller.`],
      });
    }

    const { key } = deriveAttachmentKey({ projectId: project.id, extension: type.extension });
    const { url, fields } = await presignUpload({
      key,
      contentType: type.mimeType,
      maxBytes: MAX_ATTACHMENT_BYTES,
    });

    return actionOk({ url, fields, key, mimeType: type.mimeType });
  },
});

export const confirmUploadAction = defineAction({
  name: 'attachment.confirm_upload',
  permission: ['asset:upload'],
  input: z.object({
    code: z.string().min(1),
    key: z.string().min(1),
    label: z.string().trim().min(1, 'Give the file a label.').max(200),
    contentType: z.string().min(1),
    ...targetFields,
  }),
  async handler(input, ctx) {
    const project = await resolveProject(ctx.principal, input.code);

    // The key came back from this server's own presign step, but a client
    // could still hand back one it obtained for a different project. This is
    // what stops that key from being linked here.
    if (!input.key.startsWith(`project/${project.id}/`)) {
      throw new ForbiddenError('That upload does not belong to this project.');
    }

    const declaredType = attachmentTypeFor(input.contentType);
    if (!declaredType) throw new ValidationError('That file type is not accepted.');

    const head = await headObject(input.key);
    if (!head) throw new ConflictError('The upload did not complete. Try again.');
    if (head.sizeBytes > MAX_ATTACHMENT_BYTES) {
      await deleteObject(input.key);
      throw new ValidationError('That file is too large.', {
        sizeBytes: [`Files must be ${formatFileSize(MAX_ATTACHMENT_BYTES)} or smaller.`],
      });
    }

    // D-011's principle, applied to the object that actually landed in the
    // bucket: never take the declared type on trust.
    const sample = await readObjectHead(input.key);
    const sniffed = sniffMimeType(sample);
    if (!sniffIsConsistentWith(declaredType.mimeType, sniffed)) {
      await deleteObject(input.key);
      throw new ValidationError(
        'The file contents do not match its declared type. Nothing was saved.',
      );
    }

    const attachment = await transaction(async (tx) => {
      const created = await tx.attachment.create({
        data: {
          projectId: project.id,
          kind: 'FILE',
          label: input.label,
          // Overwritten immediately below - the route needs the row's own id.
          url: '',
          storageKey: input.key,
          mimeType: declaredType.mimeType,
          sizeBytes: head.sizeBytes,
          uploadedById: ctx.principal.id,
          assetItemId: input.assetItemId ?? null,
          accessItemId: input.accessItemId ?? null,
          issueId: input.issueId ?? null,
          commentId: input.commentId ?? null,
        },
        select: { id: true },
      });

      await tx.attachment.update({
        where: { id: created.id },
        data: { url: `/api/attachments/${created.id}` },
      });

      await recordActivity(tx, {
        projectId: project.id,
        type: 'ASSET_STATUS_CHANGED',
        actorId: ctx.principal.id,
        summary: `File attached: ${input.label}`,
        detail: `${declaredType.label} - ${formatFileSize(head.sizeBytes)}`,
        visibility: 'EVERYONE',
        payload: { attachmentId: created.id },
      });

      await audit(tx, {
        principal: ctx.principal,
        projectId: project.id,
        action: 'attachment.confirm_upload',
        entityType: 'Attachment',
        entityId: created.id,
        after: { label: input.label, mimeType: declaredType.mimeType, sizeBytes: head.sizeBytes },
        ip: ctx.ip,
      });

      return created;
    });

    revalidateProject(input.code);
    return actionOk({ id: attachment.id }, 'File attached.');
  },
});
