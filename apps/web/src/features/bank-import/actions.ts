'use server';

import { z } from 'zod';
import {
  ForbiddenError,
  ValidationError,
  ConflictError,
  parseVietinbankOcrText,
  type BankTransactionStatusCode,
} from '@relay/core';
import { isUniqueViolation, transaction } from '@relay/db';
import {
  deleteObject,
  deriveBankImportKey,
  headObject,
  presignUpload,
  readObject,
  readObjectHead,
  sniffIsConsistentWith,
  sniffMimeType,
} from '@relay/storage';
import { actionOk, defineAction } from '@/server/action';
import { audit, recordActivity } from '@/server/record';
import { resolveProject, revalidateProject } from '@/features/projects/mutations';
import { extractTextFromImage, ImageTooLargeError } from './ocr';

/**
 * Same two-step shape as `features/attachments/actions.ts`
 * (request/confirm around a presigned S3 upload), plus a middle step this
 * feature actually needs: `previewBankImportAction` runs OCR on the
 * uploaded screenshot and returns parsed rows *without* saving anything, so
 * a bad OCR read gets fixed by eye in the review UI rather than silently
 * written to the ledger. Only `confirmBankImportAction` persists.
 */

const IMAGE_TYPES: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
};
const MAX_SCREENSHOT_BYTES = 10 * 1024 * 1024;

export const requestBankImportUploadAction = defineAction({
  name: 'bank_import.request_upload',
  permission: 'bank_transaction:import',
  input: z.object({
    contentType: z.string().min(1),
    sizeBytes: z.coerce.number().int().positive(),
  }),
  async handler(input, ctx) {
    const organizationId = ctx.principal.organizationId;
    if (!organizationId) throw new ForbiddenError('Your account is not part of an organization.');

    const extension = IMAGE_TYPES[input.contentType];
    if (!extension) {
      throw new ValidationError('That file type is not accepted.', {
        contentType: ['Upload a PNG, JPEG or WebP screenshot.'],
      });
    }
    if (input.sizeBytes > MAX_SCREENSHOT_BYTES) {
      throw new ValidationError('That image is too large.', {
        sizeBytes: ['Screenshots must be 10MB or smaller.'],
      });
    }

    const { key } = deriveBankImportKey({ organizationId, extension });
    const { url, fields } = await presignUpload({
      key,
      contentType: input.contentType,
      maxBytes: MAX_SCREENSHOT_BYTES,
    });

    return actionOk({ url, fields, key });
  },
});

const ParsedRowSchema = z.object({
  direction: z.string().nullable(),
  amount: z.coerce.number().int().nullable(),
  currency: z.literal('VND'),
  recipientName: z.string().nullable(),
  recipientBank: z.string().nullable(),
  recipientAccountNumber: z.string().nullable(),
  content: z.string().nullable(),
  transactionRef: z.string().nullable(),
  status: z.enum(['SUCCESS', 'FAILED', 'PENDING', 'UNKNOWN']),
  statusRaw: z.string().nullable(),
  occurredAt: z.coerce.date().nullable(),
  rawSegment: z.string(),
  warnings: z.array(z.string()),
});

export const previewBankImportAction = defineAction({
  name: 'bank_import.preview',
  permission: 'bank_transaction:import',
  input: z.object({ key: z.string().min(1) }),
  async handler(input, ctx) {
    const organizationId = ctx.principal.organizationId;
    if (!organizationId) throw new ForbiddenError('Your account is not part of an organization.');
    if (!input.key.startsWith(`bank-import/${organizationId}/`)) {
      throw new ForbiddenError('That upload does not belong to your organization.');
    }

    const head = await headObject(input.key);
    if (!head) throw new ConflictError('The upload did not complete. Try again.');
    if (head.sizeBytes > MAX_SCREENSHOT_BYTES) {
      await deleteObject(input.key);
      throw new ValidationError('That image is too large.');
    }

    const sample = await readObjectHead(input.key);
    const sniffed = sniffMimeType(sample);
    if (!sniffed || !sniffIsConsistentWith(head.contentType ?? sniffed, sniffed)) {
      await deleteObject(input.key);
      throw new ValidationError('The file contents do not look like an image. Nothing was read.');
    }

    const bytes = await readObject(input.key);
    let rawText: string;
    try {
      rawText = await extractTextFromImage(bytes);
    } catch (error) {
      if (error instanceof ImageTooLargeError) throw new ValidationError(error.message);
      throw error;
    }

    const rows = parseVietinbankOcrText(rawText);
    return actionOk({ key: input.key, rawText, rows });
  },
});

export const confirmBankImportAction = defineAction({
  name: 'bank_import.confirm',
  permission: 'bank_transaction:import',
  input: z.object({
    key: z.string().min(1),
    rows: z.array(ParsedRowSchema).min(1, 'Nothing to import.'),
    /** Optional - most imports are AHN's own vendor payments with no
     * project on the other end. When set, every row this confirm keeps is
     * linked to the same project. */
    projectCode: z.string().trim().optional(),
  }),
  async handler(input, ctx) {
    const organizationId = ctx.principal.organizationId;
    if (!organizationId) throw new ForbiddenError('Your account is not part of an organization.');
    if (!input.key.startsWith(`bank-import/${organizationId}/`)) {
      throw new ForbiddenError('That upload does not belong to your organization.');
    }

    const project = input.projectCode
      ? await resolveProject(ctx.principal, input.projectCode)
      : null;

    const result = await transaction(async (tx) => {
      let created = 0;
      let skippedAsDuplicate = 0;

      for (const row of input.rows) {
        if (row.amount === null) continue;
        try {
          const saved = await tx.bankTransaction.create({
            data: {
              organizationId,
              projectId: project?.id ?? null,
              source: 'VIETINBANK',
              direction: row.direction,
              amount: row.amount,
              currency: row.currency,
              recipientName: row.recipientName,
              recipientBank: row.recipientBank,
              recipientAccountNumber: row.recipientAccountNumber,
              content: row.content,
              transactionRef: row.transactionRef,
              status: row.status as BankTransactionStatusCode,
              occurredAt: row.occurredAt,
              rawText: row.rawSegment,
              screenshotUrl: input.key,
              importedById: ctx.principal.id,
            },
            select: { id: true },
          });
          created += 1;

          await audit(tx, {
            principal: ctx.principal,
            projectId: project?.id ?? null,
            action: 'bank_import.confirm',
            entityType: 'BankTransaction',
            entityId: saved.id,
            after: { amount: row.amount, recipientName: row.recipientName, source: 'VIETINBANK' },
            ip: ctx.ip,
          });

          if (project) {
            await recordActivity(tx, {
              projectId: project.id,
              type: 'PROJECT_UPDATED',
              actorId: ctx.principal.id,
              summary: `Bank transaction imported: ${formatVnd(row.amount)} to ${row.recipientName ?? 'unknown recipient'}`,
              detail: row.content ?? undefined,
              visibility: 'INTERNAL_AHN',
              touchProject: false,
            });
          }
        } catch (error) {
          // The organization+transactionRef unique index: the same
          // screenshot (or an overlapping one) imported twice should not
          // double an expense - skip it rather than fail the whole batch.
          if (row.transactionRef && isUniqueViolation(error, 'transactionRef')) {
            skippedAsDuplicate += 1;
            continue;
          }
          throw error;
        }
      }

      return { created, skippedAsDuplicate };
    });

    if (project) revalidateProject(project.code);

    const message =
      result.skippedAsDuplicate > 0
        ? `Imported ${result.created} transaction(s); skipped ${result.skippedAsDuplicate} already-imported duplicate(s).`
        : `Imported ${result.created} transaction(s).`;
    return actionOk(result, message);
  },
});

function formatVnd(amount: number): string {
  return `${amount.toLocaleString('vi-VN')} VND`;
}
