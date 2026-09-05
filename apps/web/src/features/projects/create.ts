'use server';

import { z } from 'zod';
import {
  clock,
  DEFAULT_ACCESS_CHECKLIST,
  DEFAULT_ASSET_CHECKLIST,
  DEFAULT_SCOPE_TEMPLATE,
  MIGRATION_TYPES,
  type MigrationType,
} from '@relay/core';
import { projectCode } from '@relay/core/server';
import { db, transaction } from '@relay/db';
import { actionOk, defineAction } from '@/server/action';
import { audit, notify, recordActivity } from '@/server/record';
import { parseDate, revalidateProject } from './mutations';

/**
 * Creating a project seeds the three checklists from the templates, so
 * "what are we waiting for" is answerable on day one rather than after somebody
 * remembers to build a list.
 */
export const createProjectAction = defineAction({
  name: 'project.create',
  permission: 'project:create',
  input: z.object({
    merchantName: z.string().trim().min(2, 'Enter the merchant name.').max(200),
    website: z.string().trim().url('Enter a valid website URL.').optional().or(z.literal('')),
    shoplineStoreId: z.string().trim().max(60).optional(),
    currentPlatform: z.string().trim().max(80).optional(),
    country: z.string().trim().max(80).optional(),
    industry: z.string().trim().max(80).optional(),

    contactName: z.string().trim().min(2, 'Enter the contact name.').max(120),
    contactEmail: z.string().trim().email('Enter a valid email address.'),
    contactPhone: z.string().trim().max(40).optional(),
    contactTitle: z.string().trim().max(80).optional(),

    migrationType: z.enum(MIGRATION_TYPES).default('ONE_TO_ONE'),
    targetLaunchDate: z.string().optional(),
    scopeSummary: z.string().trim().max(2000).optional(),
    contractTotal: z.coerce.number().min(0).optional(),

    ahnProjectManagerId: z.string().uuid().optional(),
    ahnDeveloperId: z.string().uuid().optional(),
    shoplineAmId: z.string().uuid().optional(),
    shoplineSeId: z.string().uuid().optional(),
  }),
  async handler(input, ctx) {
    const now = clock.now();
    const targetLaunchDate = parseDate(input.targetLaunchDate, 'targetLaunchDate');

    const code = await transaction(async (tx) => {
      // The sequence is derived from the row count rather than a database
      // sequence, so codes stay contiguous and readable; the unique index on
      // `code` is what actually guarantees no collision.
      const count = await tx.project.count();
      let candidate = projectCode(count + 1);
      for (let attempt = 0; attempt < 10; attempt += 1) {
        const clash = await tx.project.findUnique({ where: { code: candidate } });
        if (!clash) break;
        candidate = projectCode(count + 2 + attempt);
      }

      const merchant = await tx.merchant.create({
        data: {
          name: input.merchantName,
          website: input.website || null,
          shoplineStoreId: input.shoplineStoreId ?? null,
          currentPlatform: input.currentPlatform ?? null,
          country: input.country ?? null,
          industry: input.industry ?? null,
          contacts: {
            create: {
              name: input.contactName,
              email: input.contactEmail.toLowerCase(),
              phone: input.contactPhone ?? null,
              title: input.contactTitle ?? null,
              isPrimary: true,
            },
          },
        },
        select: { id: true },
      });

      const project = await tx.project.create({
        data: {
          code: candidate,
          merchantId: merchant.id,
          stage: 'INTRODUCTION',
          migrationType: input.migrationType,
          scopeSummary: input.scopeSummary ?? null,
          startDate: now,
          targetLaunchDate,
          lastActivityAt: now,
          contractTotalMinor: input.contractTotal ? Math.round(input.contractTotal * 100) : 0,
          ahnProjectManagerId: input.ahnProjectManagerId ?? null,
          ahnDeveloperId: input.ahnDeveloperId ?? null,
          shoplineAmId: input.shoplineAmId ?? null,
          shoplineSeId: input.shoplineSeId ?? null,
          nextAction: 'Send the introduction email to the merchant.',
          nextActionOwnerId: input.shoplineAmId ?? null,
          nextActionOwnerTeam: 'SHOPLINE',
          stageEvents: {
            create: { stage: 'INTRODUCTION', enteredAt: now, changedById: ctx.principal.id },
          },
          accessItems: {
            create: DEFAULT_ACCESS_CHECKLIST.map((item, index) => ({
              kind: item.kind,
              label: item.label,
              blocking: item.blocking,
              notes: item.hint,
              sortOrder: index,
            })),
          },
          assetItems: {
            create: DEFAULT_ASSET_CHECKLIST.map((item, index) => ({
              kind: item.kind,
              label: item.label,
              required: item.required,
              notes: item.hint,
              sortOrder: index,
            })),
          },
          scopeItems: {
            create: DEFAULT_SCOPE_TEMPLATE.map((item, index) => ({
              category: item.category,
              label: item.label,
              disposition: item.defaultIn.includes(input.migrationType as MigrationType)
                ? ('IN_SCOPE' as const)
                : ('OUT_OF_SCOPE' as const),
              notes: item.hint,
              sortOrder: index,
            })),
          },
          approvals: {
            create: (
              ['DESIGN', 'DEVELOPMENT', 'QA', 'MERCHANT_FINAL', 'SHOPLINE_DEPLOYMENT'] as const
            ).map((type) => ({ type, status: 'NOT_REQUESTED' as const })),
          },
        },
        select: { id: true, code: true },
      });

      await recordActivity(tx, {
        projectId: project.id,
        type: 'PROJECT_CREATED',
        actorId: ctx.principal.id,
        summary: `${input.merchantName} added to the portal.`,
        detail: 'Access, asset and scope checklists seeded from the standard templates.',
        visibility: 'AHN_SHOPLINE',
        touchProject: false,
      });

      await audit(tx, {
        principal: ctx.principal,
        projectId: project.id,
        action: 'project.create',
        entityType: 'Project',
        entityId: project.id,
        after: { code: project.code, merchant: input.merchantName },
        ip: ctx.ip,
      });

      await notify(tx, {
        userIds: [
          input.ahnProjectManagerId,
          input.ahnDeveloperId,
          input.shoplineAmId,
          input.shoplineSeId,
        ].filter((id): id is string => typeof id === 'string'),
        projectId: project.id,
        type: 'ASSIGNED',
        title: `You were assigned to ${input.merchantName}`,
        body: 'A new migration project has been created.',
        href: `/projects/${project.code}`,
        exceptUserId: ctx.principal.id,
      });

      return project.code;
    });

    revalidateProject(code);
    return actionOk({ code }, `${input.merchantName} created as ${code}.`);
  },
});

/** Existing merchants, so a second project does not duplicate the record. */
export const searchMerchantsAction = defineAction({
  name: 'project.search_merchants',
  permission: 'merchant:read',
  input: z.object({ q: z.string().trim().max(120).default('') }),
  async handler(input) {
    const merchants = await db.merchant.findMany({
      where: {
        deletedAt: null,
        name: input.q ? { contains: input.q, mode: 'insensitive' } : undefined,
      },
      select: { id: true, name: true, website: true, shoplineStoreId: true },
      orderBy: { name: 'asc' },
      take: 8,
    });
    return actionOk(merchants);
  },
});
