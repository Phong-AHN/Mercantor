'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import {
  CAPTURE_PHASE_LABEL,
  CAPTURE_PHASES,
  CAPTURE_VIEWPORT_LABEL,
  CAPTURE_VIEWPORTS,
  PAGE_TYPE_LABEL,
  clock,
  ConflictError,
  ForbiddenError,
  formatFileSize,
  NotFoundError,
  ValidationError,
} from '@relay/core';
import { db, transaction } from '@relay/db';
import {
  deleteObject,
  deriveAttachmentKey,
  headObject,
  presignUpload,
  putObject,
  readObjectHead,
  sniffIsConsistentWith,
  sniffMimeType,
} from '@relay/storage';
import { normaliseUrl } from '@relay/storefront';
import { actionOk, defineAction } from '@/server/action';
import { audit } from '@/server/record';
import { resolveProject, revalidateProject } from '@/features/projects/mutations';
import { captureSourceUrl } from './capture-plan';
import { CAPTURE_MAX_BYTES, CAPTURE_TYPES } from './capture-types';
import { allowedHostsFor, FetchRefused } from './fetch-page';
import { CaptureFailed, captureScreenshot } from './screenshot';

function revalidateCaptures(code: string): void {
  revalidateProject(code);
  revalidatePath('/qa');
  revalidatePath('/portal/qa');
}

/**
 * A screenshot lands the same two-step way every other file does (see
 * `features/attachments/actions.ts`): presign, browser uploads straight to
 * the bucket, then the real bytes are sniffed before a row exists. Captures
 * are never overwritten - each upload is a new row, which is the history.
 */
export const requestCaptureUploadAction = defineAction({
  name: 'qa.capture.request_upload',
  permission: 'qa:manage',
  input: z.object({
    code: z.string().min(1),
    contentType: z.string().min(1),
    sizeBytes: z.coerce.number().int().positive(),
  }),
  async handler(input, ctx) {
    const project = await resolveProject(ctx.principal, input.code);
    const type = CAPTURE_TYPES.find((entry) => entry.mimeType === input.contentType);
    if (!type) {
      throw new ValidationError('Screenshots must be PNG, JPEG or WebP.');
    }
    if (input.sizeBytes > CAPTURE_MAX_BYTES) {
      throw new ValidationError(
        `Screenshots must be ${formatFileSize(CAPTURE_MAX_BYTES)} or smaller.`,
      );
    }
    const { key } = deriveAttachmentKey({ projectId: project.id, extension: type.extension });
    const { url, fields } = await presignUpload({
      key,
      contentType: type.mimeType,
      maxBytes: CAPTURE_MAX_BYTES,
    });
    return actionOk({ url, fields, key });
  },
});

export const confirmCaptureUploadAction = defineAction({
  name: 'qa.capture.confirm_upload',
  permission: 'qa:manage',
  input: z.object({
    code: z.string().min(1),
    key: z.string().min(1),
    contentType: z.string().min(1),
    url: z.string().trim().min(1, 'Which page is this a capture of?').max(500),
    phase: z.enum(CAPTURE_PHASES),
    viewport: z.enum(CAPTURE_VIEWPORTS),
    width: z.coerce.number().int().min(200).max(10_000),
    height: z.coerce.number().int().min(100).max(100_000).optional(),
    changeNote: z.string().trim().max(1000).optional(),
    capturedAt: z.string().optional(),
  }),
  async handler(input, ctx) {
    const project = await resolveProject(ctx.principal, input.code);
    if (!input.key.startsWith(`project/${project.id}/`)) {
      throw new ForbiddenError('That upload does not belong to this project.');
    }
    const type = CAPTURE_TYPES.find((entry) => entry.mimeType === input.contentType);
    if (!type) throw new ValidationError('Screenshots must be PNG, JPEG or WebP.');

    const pageUrl = normaliseUrl(input.url);
    if (!pageUrl) {
      throw new ValidationError('That is not a web address.', { url: ['Enter the page address.'] });
    }

    const head = await headObject(input.key);
    if (!head) throw new ConflictError('The upload did not complete. Try again.');
    if (head.sizeBytes > CAPTURE_MAX_BYTES) {
      await deleteObject(input.key);
      throw new ValidationError('That screenshot is too large.');
    }
    const sniffed = sniffMimeType(await readObjectHead(input.key));
    if (!sniffIsConsistentWith(type.mimeType, sniffed)) {
      await deleteObject(input.key);
      throw new ValidationError('The file is not the image it claims to be. Nothing was saved.');
    }

    let capturedAt = clock.now();
    if (input.capturedAt) {
      const parsed = new Date(input.capturedAt);
      if (Number.isNaN(parsed.getTime()) || parsed.getTime() > capturedAt.getTime()) {
        throw new ValidationError('That capture date is not valid.', {
          capturedAt: ['Use a date in the past.'],
        });
      }
      capturedAt = parsed;
    }

    const capture = await transaction(async (tx) => {
      const page = await tx.storefrontPage.findUnique({
        where: { projectId_url: { projectId: project.id, url: pageUrl } },
        select: { id: true },
      });
      const created = await tx.pageCapture.create({
        data: {
          projectId: project.id,
          pageId: page?.id ?? null,
          url: pageUrl,
          phase: input.phase,
          viewport: input.viewport,
          width: input.width,
          height: input.height ?? null,
          storageKey: input.key,
          fileSize: head.sizeBytes,
          projectStage: project.stage,
          changeNote: input.changeNote || null,
          requestedById: ctx.principal.id,
          capturedAt,
        },
        select: { id: true },
      });
      await audit(tx, {
        principal: ctx.principal,
        projectId: project.id,
        action: 'qa.capture.confirm_upload',
        entityType: 'PageCapture',
        entityId: created.id,
        after: { url: pageUrl, phase: input.phase, viewport: input.viewport },
        ip: ctx.ip,
      });
      return created;
    });

    revalidateCaptures(input.code);
    return actionOk({ id: capture.id }, 'Capture added.');
  },
});

export const deleteCaptureAction = defineAction({
  name: 'qa.capture.delete',
  permission: 'qa:manage',
  input: z.object({ code: z.string().min(1), captureId: z.string().uuid() }),
  async handler(input, ctx) {
    const project = await resolveProject(ctx.principal, input.code);
    const key = await transaction(async (tx) => {
      const capture = await tx.pageCapture.findFirst({
        where: { id: input.captureId, projectId: project.id },
        select: { id: true, storageKey: true, url: true },
      });
      if (!capture) throw new NotFoundError('That capture is not on this project.');
      await tx.pageCapture.delete({ where: { id: capture.id } });
      await audit(tx, {
        principal: ctx.principal,
        projectId: project.id,
        action: 'qa.capture.delete',
        entityType: 'PageCapture',
        entityId: capture.id,
        before: { url: capture.url },
        ip: ctx.ip,
      });
      return capture.storageKey;
    });
    await deleteObject(key).catch(() => undefined);
    revalidateCaptures(input.code);
    return actionOk(undefined, 'Capture deleted.');
  },
});

// ─── Automated capture ──────────────────────────────────────────────────────

/**
 * Screenshot one page, one viewport, one phase with a headless browser and
 * file it exactly like an upload: a new PageCapture row, never an overwrite.
 *
 * When the page then has both a before and an after for that viewport, its
 * comparison is created, or moved to the newest pair. A comparison the
 * client can already see is taken back to internal when its images change,
 * so nobody publishes a capture they have not looked at.
 */
export const autoCaptureAction = defineAction({
  name: 'qa.capture.auto',
  permission: 'qa:manage',
  input: z.object({
    code: z.string().min(1),
    pageId: z.string().uuid(),
    phase: z.enum(CAPTURE_PHASES),
    viewport: z.enum(CAPTURE_VIEWPORTS),
  }),
  async handler(input, ctx) {
    const project = await resolveProject(ctx.principal, input.code);
    const [profile, page] = await Promise.all([
      db.storefrontProfile.findUnique({
        where: { projectId: project.id },
        select: { storefrontUrl: true, destinationUrl: true },
      }),
      db.storefrontPage.findFirst({
        where: { id: input.pageId, projectId: project.id },
        select: { id: true, url: true, pageType: true },
      }),
    ]);
    if (!profile) throw new ConflictError('Set the storefront URL for this project first.');
    if (!page) throw new NotFoundError('That page is not on this project.');

    const sourceUrl = captureSourceUrl(page.url, input.phase, profile);
    let shot;
    try {
      shot = await captureScreenshot(sourceUrl, {
        allowedHosts: allowedHostsFor([profile.storefrontUrl, profile.destinationUrl]),
        viewport: input.viewport,
      });
    } catch (error) {
      if (error instanceof CaptureFailed || error instanceof FetchRefused) {
        throw new ConflictError(error.message);
      }
      throw error;
    }

    const { key } = deriveAttachmentKey({ projectId: project.id, extension: 'jpg' });
    await putObject({ key, body: shot.bytes, contentType: 'image/jpeg' });

    const result = await transaction(async (tx) => {
      const capture = await tx.pageCapture.create({
        data: {
          projectId: project.id,
          pageId: page.id,
          // The page's identity, so before and after group together even
          // when they come from two different hosts.
          url: page.url,
          phase: input.phase,
          viewport: input.viewport,
          width: shot.width,
          height: shot.height,
          storageKey: key,
          fileSize: shot.bytes.byteLength,
          projectStage: project.stage,
          changeNote: `Automated from ${shot.finalUrl}${shot.truncated ? ' (cut off at the maximum height)' : ''}`,
          requestedById: ctx.principal.id,
        },
        select: { id: true },
      });

      const latest = async (phase: 'BEFORE' | 'AFTER') =>
        tx.pageCapture.findFirst({
          where: { projectId: project.id, url: page.url, viewport: input.viewport, phase },
          orderBy: { capturedAt: 'desc' },
          select: { id: true },
        });
      const [before, after] = await Promise.all([latest('BEFORE'), latest('AFTER')]);

      let paired: 'created' | 'updated' | 'unshared' | null = null;
      if (before && after) {
        const existing = await tx.comparisonPair.findFirst({
          where: {
            projectId: project.id,
            beforeCapture: { url: page.url, viewport: input.viewport },
          },
          orderBy: { createdAt: 'asc' },
          select: { id: true, beforeCaptureId: true, afterCaptureId: true, clientVisibleAt: true },
        });
        if (!existing) {
          const path = new URL(page.url).pathname;
          await tx.comparisonPair.create({
            data: {
              projectId: project.id,
              beforeCaptureId: before.id,
              afterCaptureId: after.id,
              label: path === '/' ? 'Homepage' : `${PAGE_TYPE_LABEL[page.pageType].label} ${path}`,
              afterLabel: 'AFTER',
            },
          });
          paired = 'created';
        } else if (existing.beforeCaptureId !== before.id || existing.afterCaptureId !== after.id) {
          const clash = await tx.comparisonPair.findUnique({
            where: {
              beforeCaptureId_afterCaptureId: { beforeCaptureId: before.id, afterCaptureId: after.id },
            },
            select: { id: true },
          });
          if (!clash) {
            await tx.comparisonPair.update({
              where: { id: existing.id },
              data: {
                beforeCaptureId: before.id,
                afterCaptureId: after.id,
                clientVisibleAt: null,
              },
            });
            paired = existing.clientVisibleAt ? 'unshared' : 'updated';
          }
        }
      }

      await audit(tx, {
        principal: ctx.principal,
        projectId: project.id,
        action: 'qa.capture.auto',
        entityType: 'PageCapture',
        entityId: capture.id,
        after: { url: sourceUrl, phase: input.phase, viewport: input.viewport, paired },
        ip: ctx.ip,
      });
      return { id: capture.id, paired };
    });

    revalidateCaptures(input.code);
    const label = `${CAPTURE_PHASE_LABEL[input.phase].label} ${CAPTURE_VIEWPORT_LABEL[input.viewport].label.toLowerCase()} captured`;
    const message =
      result.paired === 'created'
        ? `${label}; comparison created.`
        : result.paired === 'unshared'
          ? `${label}. The comparison now uses it and is hidden from the client until it is shared again.`
          : result.paired === 'updated'
            ? `${label}; comparison updated.`
            : `${label}.`;
    return actionOk({ id: result.id }, message);
  },
});

// ─── Curated comparisons ────────────────────────────────────────────────────

export const saveComparisonAction = defineAction({
  name: 'qa.comparison.save',
  permission: 'qa:manage',
  input: z.object({
    code: z.string().min(1),
    beforeCaptureId: z.string().uuid(),
    afterCaptureId: z.string().uuid(),
    label: z.string().trim().min(1, 'Name the comparison, e.g. "Homepage".').max(120),
    afterLabel: z.string().trim().max(40).optional(),
    changeNote: z.string().trim().max(1000).optional(),
    featured: z.boolean().default(false),
  }),
  async handler(input, ctx) {
    const project = await resolveProject(ctx.principal, input.code);
    await transaction(async (tx) => {
      const captures = await tx.pageCapture.findMany({
        where: { id: { in: [input.beforeCaptureId, input.afterCaptureId] }, projectId: project.id },
        select: { id: true, phase: true, viewport: true },
      });
      const before = captures.find((capture) => capture.id === input.beforeCaptureId);
      const after = captures.find((capture) => capture.id === input.afterCaptureId);
      if (!before || !after) throw new NotFoundError('Those captures are not on this project.');
      if (before.viewport !== after.viewport) {
        throw new ValidationError('Compare desktop with desktop and mobile with mobile.');
      }
      if (input.featured) {
        await tx.comparisonPair.updateMany({
          where: { projectId: project.id, featured: true },
          data: { featured: false },
        });
      }
      const data = {
        label: input.label,
        afterLabel: input.afterLabel || 'AFTER',
        changeNote: input.changeNote || null,
        featured: input.featured,
      };
      const saved = await tx.comparisonPair.upsert({
        where: {
          beforeCaptureId_afterCaptureId: {
            beforeCaptureId: before.id,
            afterCaptureId: after.id,
          },
        },
        create: {
          projectId: project.id,
          beforeCaptureId: before.id,
          afterCaptureId: after.id,
          ...data,
        },
        update: data,
        select: { id: true },
      });
      await audit(tx, {
        principal: ctx.principal,
        projectId: project.id,
        action: 'qa.comparison.save',
        entityType: 'ComparisonPair',
        entityId: saved.id,
        after: data,
        ip: ctx.ip,
      });
    });
    revalidateCaptures(input.code);
    return actionOk(undefined, 'Comparison saved.');
  },
});

export const setComparisonVisibilityAction = defineAction({
  name: 'qa.comparison.visibility',
  permission: 'finding:approve',
  input: z.object({ code: z.string().min(1), pairId: z.string().uuid(), visible: z.boolean() }),
  async handler(input, ctx) {
    const project = await resolveProject(ctx.principal, input.code);
    await transaction(async (tx) => {
      const pair = await tx.comparisonPair.findFirst({
        where: { id: input.pairId, projectId: project.id },
        select: { id: true },
      });
      if (!pair) throw new NotFoundError('That comparison is not on this project.');
      await tx.comparisonPair.update({
        where: { id: pair.id },
        data: { clientVisibleAt: input.visible ? clock.now() : null },
      });
      await audit(tx, {
        principal: ctx.principal,
        projectId: project.id,
        action: 'qa.comparison.visibility',
        entityType: 'ComparisonPair',
        entityId: pair.id,
        after: { visible: input.visible },
        ip: ctx.ip,
      });
    });
    revalidateCaptures(input.code);
    return actionOk(undefined, input.visible ? 'Shared with the client.' : 'Hidden from the client.');
  },
});

export const deleteComparisonAction = defineAction({
  name: 'qa.comparison.delete',
  permission: 'qa:manage',
  input: z.object({ code: z.string().min(1), pairId: z.string().uuid() }),
  async handler(input, ctx) {
    const project = await resolveProject(ctx.principal, input.code);
    await transaction(async (tx) => {
      const deleted = await tx.comparisonPair.deleteMany({
        where: { id: input.pairId, projectId: project.id },
      });
      if (deleted.count === 0) throw new NotFoundError('That comparison is not on this project.');
      await audit(tx, {
        principal: ctx.principal,
        projectId: project.id,
        action: 'qa.comparison.delete',
        entityType: 'ComparisonPair',
        entityId: input.pairId,
        ip: ctx.ip,
      });
    });
    revalidateCaptures(input.code);
    return actionOk(undefined, 'Comparison removed.');
  },
});

// ─── Headline numbers ───────────────────────────────────────────────────────

export const saveShowcaseMetricAction = defineAction({
  name: 'qa.metric.save',
  permission: 'qa:manage',
  input: z.object({
    code: z.string().min(1),
    metricId: z.string().uuid().optional(),
    label: z.string().trim().min(2, 'Say what was measured.').max(120),
    beforeValue: z.coerce.number().finite().nullable().optional(),
    afterValue: z.coerce.number().finite(),
    unit: z.string().trim().max(20).optional(),
    direction: z.enum(['LOWER_IS_BETTER', 'HIGHER_IS_BETTER', 'NEUTRAL']),
    measuredAt: z.string().optional(),
    featured: z.boolean().default(true),
  }),
  async handler(input, ctx) {
    const project = await resolveProject(ctx.principal, input.code);
    const measuredAt = input.measuredAt ? new Date(input.measuredAt) : clock.now();
    if (Number.isNaN(measuredAt.getTime())) {
      throw new ValidationError('That date is not valid.', { measuredAt: ['Pick a date.'] });
    }
    await transaction(async (tx) => {
      const data = {
        label: input.label,
        beforeValue: input.beforeValue ?? null,
        afterValue: input.afterValue,
        unit: input.unit || null,
        direction: input.direction,
        source: 'MANUAL' as const,
        measuredAt,
        enteredById: ctx.principal.id,
        featured: input.featured,
      };
      let id = input.metricId;
      if (id) {
        const updated = await tx.showcaseMetric.updateMany({
          where: { id, projectId: project.id },
          data,
        });
        if (updated.count === 0) throw new NotFoundError('That number is not on this project.');
      } else {
        const count = await tx.showcaseMetric.count({ where: { projectId: project.id } });
        id = (
          await tx.showcaseMetric.create({
            data: { projectId: project.id, displayOrder: count, ...data },
            select: { id: true },
          })
        ).id;
      }
      await audit(tx, {
        principal: ctx.principal,
        projectId: project.id,
        action: 'qa.metric.save',
        entityType: 'ShowcaseMetric',
        entityId: id,
        after: { label: input.label, before: input.beforeValue, after: input.afterValue },
        ip: ctx.ip,
      });
    });
    revalidateCaptures(input.code);
    return actionOk(undefined, 'Number saved.');
  },
});

export const deleteShowcaseMetricAction = defineAction({
  name: 'qa.metric.delete',
  permission: 'qa:manage',
  input: z.object({ code: z.string().min(1), metricId: z.string().uuid() }),
  async handler(input, ctx) {
    const project = await resolveProject(ctx.principal, input.code);
    await transaction(async (tx) => {
      const deleted = await tx.showcaseMetric.deleteMany({
        where: { id: input.metricId, projectId: project.id },
      });
      if (deleted.count === 0) throw new NotFoundError('That number is not on this project.');
      await audit(tx, {
        principal: ctx.principal,
        projectId: project.id,
        action: 'qa.metric.delete',
        entityType: 'ShowcaseMetric',
        entityId: input.metricId,
        ip: ctx.ip,
      });
    });
    revalidateCaptures(input.code);
    return actionOk(undefined, 'Number removed.');
  },
});
