import 'server-only';
import { cache } from 'react';
import {
  clock,
  NotFoundError,
  type MigrationType,
  type ProjectHealth,
  type ProjectStage,
  type Team,
} from '@relay/core';
import { db, type Prisma } from '@relay/db';
import { can, projectScopeWhere, readableVisibilities, type Principal } from '@relay/rbac';
import { buildSnapshot, type ProjectSnapshot } from './snapshot';

/**
 * Read side of the project record. Every query starts from
 * `projectScopeWhere(principal)`, so a merchant asking for a project id that is
 * not theirs gets no rows - the restriction is in the query, not applied after
 * the fact.
 */

export interface ProjectFilters {
  q?: string;
  stage?: ProjectStage[];
  health?: ProjectHealth[];
  migrationType?: MigrationType[];
  ahnPmId?: string;
  ahnDevId?: string;
  shoplineAmId?: string;
  blockerOwner?: Team;
  invoiceStatus?: string[];
  /** `overdue` = past target launch, `soon` = launching in the next 14 days. */
  launch?: 'overdue' | 'soon' | 'none';
  includeCompleted?: boolean;
  sort?: 'recent' | 'oldest' | 'age' | 'launch' | 'merchant' | 'stage';
}

const listSelect = {
  id: true,
  code: true,
  stage: true,
  migrationType: true,
  health: true,
  startDate: true,
  targetLaunchDate: true,
  actualLaunchDate: true,
  completedAt: true,
  lastActivityAt: true,
  nextAction: true,
  nextActionDueDate: true,
  nextActionOwnerTeam: true,
  contractTotalMinor: true,
  currency: true,
  merchant: {
    select: { id: true, name: true, website: true, shoplineStoreId: true, currentPlatform: true },
  },
  ahnProjectManager: { select: { id: true, name: true, email: true, role: true } },
  ahnDeveloper: { select: { id: true, name: true, email: true, role: true } },
  shoplineAm: { select: { id: true, name: true, email: true, role: true } },
  shoplineSe: { select: { id: true, name: true, email: true, role: true } },
  nextActionOwner: { select: { id: true, name: true, role: true } },
  stageEvents: {
    select: { stage: true, enteredAt: true, exitedAt: true, ownerTeam: true },
    orderBy: { enteredAt: 'asc' },
  },
  blockers: {
    select: {
      id: true,
      title: true,
      category: true,
      ownerTeam: true,
      ownerUserId: true,
      startedAt: true,
      resolvedAt: true,
      nextAction: true,
      dueDate: true,
      owner: { select: { id: true, name: true, role: true } },
      ownerships: {
        select: { blockerId: true, ownerTeam: true, startedAt: true, endedAt: true },
      },
    },
    orderBy: { startedAt: 'asc' },
  },
  issues: { select: { severity: true, status: true, title: true } },
  invoices: {
    select: { status: true, amountMinor: true, paidMinor: true, currency: true, dueDate: true },
  },
  approvals: { select: { type: true, status: true } },
} satisfies Prisma.ProjectSelect;

type ProjectListRecord = Prisma.ProjectGetPayload<{ select: typeof listSelect }>;

export interface PersonRef {
  id: string;
  name: string;
  team: Team;
  role: string;
}

export interface ProjectListItem {
  id: string;
  code: string;
  merchant: {
    id: string;
    name: string;
    website: string | null;
    storeId: string | null;
    platform: string | null;
  };
  stage: ProjectStage;
  migrationType: MigrationType;
  startDate: Date;
  targetLaunchDate: Date | null;
  actualLaunchDate: Date | null;
  completedAt: Date | null;
  lastActivityAt: Date;
  nextAction: string | null;
  nextActionDueDate: Date | null;
  nextActionOwner: PersonRef | null;
  nextActionOwnerTeam: Team | null;
  contractTotalMinor: number;
  people: {
    ahnPm: PersonRef | null;
    ahnDev: PersonRef | null;
    shoplineAm: PersonRef | null;
    shoplineSe: PersonRef | null;
  };
  blocker: {
    id: string;
    title: string;
    category: string;
    ownerTeam: Team;
    ownerName: string | null;
    startedAt: Date;
    nextAction: string | null;
    dueDate: Date | null;
  } | null;
  approvals: Partial<
    Record<'DESIGN' | 'DEVELOPMENT' | 'QA' | 'MERCHANT_FINAL' | 'SHOPLINE_DEPLOYMENT', string>
  >;
  snapshot: ProjectSnapshot;
}

const TEAM_BY_ROLE: Record<string, Team> = {
  PLATFORM_ADMIN: 'AHN',
  AHN_ADMIN: 'AHN',
  AHN_PROJECT_MANAGER: 'AHN',
  AHN_DEVELOPER: 'AHN',
  SHOPLINE_ADMIN: 'SHOPLINE',
  SHOPLINE_ACCOUNT_MANAGER: 'SHOPLINE',
  SHOPLINE_SOLUTIONS_ENGINEER: 'SHOPLINE',
  MERCHANT: 'MERCHANT',
};

function toPerson(
  user: { id: string; name: string; role: string } | null | undefined,
): PersonRef | null {
  if (!user) return null;
  return {
    id: user.id,
    name: user.name,
    team: TEAM_BY_ROLE[user.role] ?? 'OTHER',
    role: user.role,
  };
}

function toListItem(row: ProjectListRecord, now: Date): ProjectListItem {
  const openBlockers = row.blockers.filter((blocker) => blocker.resolvedAt === null);
  const primaryBlocker = openBlockers[0] ?? null;

  const snapshot = buildSnapshot({
    startDate: row.startDate,
    targetLaunchDate: row.targetLaunchDate,
    completedAt: row.completedAt,
    lastActivityAt: row.lastActivityAt,
    stage: row.stage,
    stageEvents: row.stageEvents,
    blockerOwnerships: row.blockers.flatMap((blocker) => blocker.ownerships),
    openBlockers,
    issues: row.issues,
    invoices: row.invoices,
    contractTotalMinor: row.contractTotalMinor,
    currency: row.currency,
    approvals: row.approvals,
    now,
  });

  const approvals: ProjectListItem['approvals'] = {};
  for (const approval of row.approvals) approvals[approval.type] = approval.status;

  return {
    id: row.id,
    code: row.code,
    merchant: {
      id: row.merchant.id,
      name: row.merchant.name,
      website: row.merchant.website,
      storeId: row.merchant.shoplineStoreId,
      platform: row.merchant.currentPlatform,
    },
    stage: row.stage,
    migrationType: row.migrationType,
    startDate: row.startDate,
    targetLaunchDate: row.targetLaunchDate,
    actualLaunchDate: row.actualLaunchDate,
    completedAt: row.completedAt,
    lastActivityAt: row.lastActivityAt,
    nextAction: row.nextAction,
    nextActionDueDate: row.nextActionDueDate,
    nextActionOwner: toPerson(row.nextActionOwner),
    nextActionOwnerTeam: row.nextActionOwnerTeam as Team | null,
    contractTotalMinor: row.contractTotalMinor,
    people: {
      ahnPm: toPerson(row.ahnProjectManager),
      ahnDev: toPerson(row.ahnDeveloper),
      shoplineAm: toPerson(row.shoplineAm),
      shoplineSe: toPerson(row.shoplineSe),
    },
    blocker: primaryBlocker
      ? {
          id: primaryBlocker.id,
          title: primaryBlocker.title,
          category: primaryBlocker.category,
          ownerTeam: primaryBlocker.ownerTeam as Team,
          ownerName: primaryBlocker.owner?.name ?? null,
          startedAt: primaryBlocker.startedAt,
          nextAction: primaryBlocker.nextAction,
          dueDate: primaryBlocker.dueDate,
        }
      : null,
    approvals,
    snapshot,
  };
}

function buildWhere(principal: Principal, filters: ProjectFilters): Prisma.ProjectWhereInput {
  const where: Prisma.ProjectWhereInput = projectScopeWhere(principal) as Prisma.ProjectWhereInput;
  const and: Prisma.ProjectWhereInput[] = [];

  if (filters.q) {
    const q = filters.q.trim();
    and.push({
      OR: [
        { code: { contains: q, mode: 'insensitive' } },
        { merchant: { name: { contains: q, mode: 'insensitive' } } },
        { merchant: { website: { contains: q, mode: 'insensitive' } } },
        { merchant: { shoplineStoreId: { contains: q, mode: 'insensitive' } } },
      ],
    });
  }
  if (filters.stage?.length) and.push({ stage: { in: filters.stage } });
  if (filters.health?.length) and.push({ health: { in: filters.health } });
  if (filters.migrationType?.length) and.push({ migrationType: { in: filters.migrationType } });
  if (filters.ahnPmId) and.push({ ahnProjectManagerId: filters.ahnPmId });
  if (filters.ahnDevId) and.push({ ahnDeveloperId: filters.ahnDevId });
  if (filters.shoplineAmId) and.push({ shoplineAmId: filters.shoplineAmId });
  if (filters.blockerOwner) {
    and.push({ blockers: { some: { resolvedAt: null, ownerTeam: filters.blockerOwner } } });
  }
  if (!filters.includeCompleted) and.push({ stage: { not: 'COMPLETED' } });

  const now = clock.now();
  if (filters.launch === 'overdue') {
    and.push({ targetLaunchDate: { lt: now }, stage: { notIn: ['COMPLETED', 'DEPLOYED_LIVE'] } });
  } else if (filters.launch === 'soon') {
    and.push({
      targetLaunchDate: { gte: now, lte: new Date(now.getTime() + 14 * 86_400_000) },
    });
  } else if (filters.launch === 'none') {
    and.push({ targetLaunchDate: null });
  }

  return and.length > 0 ? { ...where, AND: and } : where;
}

const ORDER: Record<NonNullable<ProjectFilters['sort']>, Prisma.ProjectOrderByWithRelationInput> = {
  recent: { lastActivityAt: 'desc' },
  oldest: { lastActivityAt: 'asc' },
  age: { startDate: 'asc' },
  launch: { targetLaunchDate: 'asc' },
  merchant: { merchant: { name: 'asc' } },
  stage: { stage: 'asc' },
};

export async function listProjects(
  principal: Principal,
  filters: ProjectFilters = {},
): Promise<ProjectListItem[]> {
  const rows = await db.project.findMany({
    where: buildWhere(principal, filters),
    select: listSelect,
    orderBy: ORDER[filters.sort ?? 'recent'],
    take: 200,
  });

  const now = clock.now();
  const items = rows.map((row) => toListItem(row, now));

  // Health is derived, so a health filter has to be applied after computation
  // rather than trusting the denormalised column, which a sweep may not have
  // refreshed yet.
  if (filters.health?.length) {
    return items.filter((item) => filters.health!.includes(item.snapshot.health.health));
  }
  return items;
}

export async function countProjects(principal: Principal): Promise<number> {
  return db.project.count({ where: projectScopeWhere(principal) as Prisma.ProjectWhereInput });
}

/** Full detail for the project page, including everything the tabs need. */
export const getProject = cache(async (principal: Principal, code: string) => {
  const scope = projectScopeWhere(principal) as Prisma.ProjectWhereInput;
  const visibilities = readableVisibilities(principal);

  const project = await db.project.findFirst({
    where: { ...scope, code },
    select: {
      ...listSelect,
      scopeSummary: true,
      deploymentNotes: true,
      actualLaunchDate: true,
      merchant: {
        select: {
          id: true,
          name: true,
          website: true,
          shoplineStoreId: true,
          currentPlatform: true,
          country: true,
          industry: true,
          notes: true,
          contacts: {
            select: {
              id: true,
              name: true,
              email: true,
              phone: true,
              title: true,
              isPrimary: true,
            },
            orderBy: [{ isPrimary: 'desc' }, { name: 'asc' }],
          },
        },
      },
      members: {
        select: {
          id: true,
          note: true,
          user: { select: { id: true, name: true, email: true, role: true } },
        },
      },
      scopeItems: { orderBy: [{ sortOrder: 'asc' }, { label: 'asc' }] },
      accessItems: { orderBy: [{ sortOrder: 'asc' }, { label: 'asc' }] },
      assetItems: { orderBy: [{ sortOrder: 'asc' }, { label: 'asc' }] },
      attachments: {
        select: {
          id: true,
          kind: true,
          label: true,
          url: true,
          mimeType: true,
          sizeBytes: true,
          assetItemId: true,
          accessItemId: true,
          commentId: true,
          issueId: true,
          createdAt: true,
          uploadedBy: { select: { id: true, name: true, role: true } },
        },
        orderBy: { createdAt: 'desc' },
      },
      integrations: true,
      introEmails: {
        select: {
          id: true,
          status: true,
          subject: true,
          bodyText: true,
          recipients: true,
          sentAt: true,
          respondedAt: true,
          responseNote: true,
          createdAt: true,
          sentBy: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: 'desc' },
      },
      handoffs: {
        select: {
          id: true,
          submittedAt: true,
          checklist: true,
          deploymentNotes: true,
          decision: true,
          decidedAt: true,
          decisionNotes: true,
          submittedBy: { select: { id: true, name: true, role: true } },
          decidedBy: { select: { id: true, name: true, role: true } },
        },
        orderBy: { submittedAt: 'desc' },
      },
    },
  });

  if (!project)
    throw new NotFoundError('That project does not exist, or it is not one you can see.');

  const [comments, activities, issues, invoices, approvals, blockers, slaBreaches] =
    await Promise.all([
      db.comment.findMany({
        where: { projectId: project.id, deletedAt: null, visibility: { in: visibilities } },
        select: {
          id: true,
          body: true,
          category: true,
          visibility: true,
          status: true,
          source: true,
          sourceUrl: true,
          createdAt: true,
          resolvedAt: true,
          parentId: true,
          author: { select: { id: true, name: true, role: true } },
          mentions: { select: { user: { select: { id: true, name: true } } } },
          attachments: { select: { id: true, kind: true, label: true, url: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
      db.activityEvent.findMany({
        where: { projectId: project.id, visibility: { in: visibilities } },
        select: {
          id: true,
          type: true,
          summary: true,
          detail: true,
          occurredAt: true,
          payload: true,
          actor: { select: { id: true, name: true, role: true } },
        },
        orderBy: { occurredAt: 'desc' },
        take: 150,
      }),
      db.issue.findMany({
        where: { projectId: project.id },
        select: {
          id: true,
          reference: true,
          title: true,
          description: true,
          severity: true,
          status: true,
          ownerTeam: true,
          dueDate: true,
          reportedAt: true,
          resolvedAt: true,
          resolution: true,
          clickUpTaskId: true,
          clickUpTaskUrl: true,
          owner: { select: { id: true, name: true, role: true } },
          reportedBy: { select: { id: true, name: true, role: true } },
          attachments: { select: { id: true, kind: true, label: true, url: true } },
        },
        orderBy: [{ resolvedAt: 'asc' }, { severity: 'desc' }, { reportedAt: 'desc' }],
      }),
      can(principal, 'invoice:read')
        ? db.invoice.findMany({
            where: { projectId: project.id },
            orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
          })
        : Promise.resolve([]),
      db.approval.findMany({
        where: { projectId: project.id },
        select: {
          id: true,
          type: true,
          status: true,
          notes: true,
          requestedAt: true,
          decidedAt: true,
          requestedBy: { select: { id: true, name: true, role: true } },
          decidedBy: { select: { id: true, name: true, role: true } },
        },
      }),
      db.blocker.findMany({
        where: { projectId: project.id },
        select: {
          id: true,
          category: true,
          title: true,
          description: true,
          ownerTeam: true,
          nextAction: true,
          dueDate: true,
          startedAt: true,
          resolvedAt: true,
          resolution: true,
          owner: { select: { id: true, name: true, role: true } },
          createdBy: { select: { id: true, name: true, role: true } },
          ownerships: {
            select: {
              id: true,
              blockerId: true,
              ownerTeam: true,
              startedAt: true,
              endedAt: true,
              note: true,
              owner: { select: { id: true, name: true } },
            },
            orderBy: { startedAt: 'asc' },
          },
        },
        orderBy: [{ resolvedAt: 'asc' }, { startedAt: 'desc' }],
      }),
      db.slaBreach.findMany({
        where: { projectId: project.id },
        select: {
          id: true,
          kind: true,
          stage: true,
          targetDays: true,
          startedAt: true,
          resolvedAt: true,
        },
        orderBy: [{ resolvedAt: 'asc' }, { startedAt: 'desc' }],
      }),
    ]);

  const now = clock.now();
  const listItem = toListItem(project as unknown as ProjectListRecord, now);

  return {
    ...listItem,
    scopeSummary: project.scopeSummary,
    deploymentNotes: project.deploymentNotes,
    actualLaunchDate: project.actualLaunchDate,
    merchantDetail: project.merchant,
    members: project.members,
    scopeItems: project.scopeItems,
    accessItems: project.accessItems,
    assetItems: project.assetItems,
    attachments: project.attachments,
    integrations: project.integrations,
    introEmails: project.introEmails,
    handoffs: project.handoffs,
    comments,
    activities,
    issues,
    invoices,
    approvals,
    blockers,
    slaBreaches,
  };
});

export type ProjectDetail = Awaited<ReturnType<typeof getProject>>;

/** Assignable people, grouped by side, for the assignment controls. */
export const listAssignableUsers = cache(async () => {
  const users = await db.user.findMany({
    where: { deletedAt: null, isActive: true, role: { not: 'MERCHANT' } },
    select: { id: true, name: true, email: true, role: true, title: true },
    orderBy: { name: 'asc' },
  });
  return {
    all: users,
    ahn: users.filter((user) => user.role.startsWith('AHN') || user.role === 'PLATFORM_ADMIN'),
    shopline: users.filter((user) => user.role.startsWith('SHOPLINE')),
  };
});
