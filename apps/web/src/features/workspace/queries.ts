import 'server-only';
import { clock, type Team } from '@relay/core';
import { db, type Prisma } from '@relay/db';
import { can, canDecideApproval, projectScopeWhere, type Principal } from '@relay/rbac';

/**
 * Cross-project reads for the workspace-level pages. All of them start from
 * `projectScopeWhere`, so a merchant principal can never widen a list by
 * visiting a URL meant for internal roles.
 */
function scope(principal: Principal): Prisma.ProjectWhereInput {
  return projectScopeWhere(principal) as Prisma.ProjectWhereInput;
}

const PROJECT_BRIEF = {
  id: true,
  code: true,
  stage: true,
  health: true,
  targetLaunchDate: true,
  merchant: { select: { name: true } },
} satisfies Prisma.ProjectSelect;

export async function listOpenBlockers(principal: Principal, ownerTeam?: Team) {
  const blockers = await db.blocker.findMany({
    where: {
      resolvedAt: null,
      ownerTeam,
      project: scope(principal),
    },
    select: {
      id: true,
      title: true,
      description: true,
      category: true,
      ownerTeam: true,
      nextAction: true,
      dueDate: true,
      startedAt: true,
      owner: { select: { id: true, name: true } },
      project: { select: PROJECT_BRIEF },
    },
    orderBy: { startedAt: 'asc' },
    take: 200,
  });

  const now = clock.now();
  return blockers.map((blocker) => ({
    ...blocker,
    ageMs: now.getTime() - blocker.startedAt.getTime(),
  }));
}

export async function listIssues(principal: Principal, options: { onlyOpen?: boolean } = {}) {
  return db.issue.findMany({
    where: {
      project: scope(principal),
      status: options.onlyOpen ? { in: ['OPEN', 'IN_PROGRESS', 'WAITING_ON_OTHERS'] } : undefined,
    },
    select: {
      id: true,
      reference: true,
      title: true,
      severity: true,
      status: true,
      ownerTeam: true,
      dueDate: true,
      reportedAt: true,
      resolvedAt: true,
      owner: { select: { id: true, name: true } },
      project: { select: PROJECT_BRIEF },
    },
    orderBy: [{ severity: 'desc' }, { reportedAt: 'desc' }],
    take: 200,
  });
}

export async function listPendingApprovals(principal: Principal) {
  const decidable = (
    ['DESIGN', 'DEVELOPMENT', 'QA', 'MERCHANT_FINAL', 'SHOPLINE_DEPLOYMENT'] as const
  ).filter((type) => canDecideApproval(principal, type));

  const approvals = await db.approval.findMany({
    where: { status: 'PENDING', project: scope(principal) },
    select: {
      id: true,
      type: true,
      status: true,
      requestedAt: true,
      notes: true,
      requestedBy: { select: { name: true } },
      project: { select: PROJECT_BRIEF },
    },
    orderBy: { requestedAt: 'asc' },
    take: 200,
  });

  return approvals.map((approval) => ({
    ...approval,
    mine: decidable.includes(approval.type),
  }));
}

export async function listHandoffs(principal: Principal) {
  return db.handoffSubmission.findMany({
    where: { project: scope(principal) },
    select: {
      id: true,
      submittedAt: true,
      decision: true,
      decidedAt: true,
      deploymentNotes: true,
      decisionNotes: true,
      submittedBy: { select: { name: true } },
      decidedBy: { select: { name: true } },
      project: { select: PROJECT_BRIEF },
    },
    orderBy: [{ decision: 'asc' }, { submittedAt: 'desc' }],
    take: 100,
  });
}

export async function listInvoices(principal: Principal) {
  if (!can(principal, 'invoice:read')) return [];
  return db.invoice.findMany({
    where: { project: scope(principal) },
    select: {
      id: true,
      milestone: true,
      number: true,
      status: true,
      amountMinor: true,
      paidMinor: true,
      currency: true,
      invoiceDate: true,
      dueDate: true,
      project: { select: PROJECT_BRIEF },
    },
    orderBy: [{ dueDate: 'asc' }],
    take: 300,
  });
}

/** Everything currently pointed at one person. Powers the "My work" page. */
export async function getMyWork(principal: Principal) {
  const projectScope = scope(principal);

  const [assignedProjects, nextActions, blockers, issues, approvals, mentions] = await Promise.all([
    db.project.findMany({
      where: {
        ...projectScope,
        OR: [
          { ahnProjectManagerId: principal.id },
          { ahnDeveloperId: principal.id },
          { shoplineAmId: principal.id },
          { shoplineSeId: principal.id },
        ],
        stage: { not: 'COMPLETED' },
      },
      select: {
        ...PROJECT_BRIEF,
        lastActivityAt: true,
        nextAction: true,
        nextActionDueDate: true,
        currentBlocker: { select: { title: true, ownerTeam: true } },
      },
      orderBy: { lastActivityAt: 'desc' },
    }),
    db.project.findMany({
      where: { ...projectScope, nextActionOwnerId: principal.id, stage: { not: 'COMPLETED' } },
      select: { ...PROJECT_BRIEF, nextAction: true, nextActionDueDate: true },
      orderBy: { nextActionDueDate: 'asc' },
    }),
    db.blocker.findMany({
      where: { resolvedAt: null, ownerUserId: principal.id, project: projectScope },
      select: {
        id: true,
        title: true,
        nextAction: true,
        dueDate: true,
        startedAt: true,
        project: { select: PROJECT_BRIEF },
      },
      orderBy: { startedAt: 'asc' },
    }),
    db.issue.findMany({
      where: {
        ownerUserId: principal.id,
        status: { in: ['OPEN', 'IN_PROGRESS', 'WAITING_ON_OTHERS'] },
        project: projectScope,
      },
      select: {
        id: true,
        reference: true,
        title: true,
        severity: true,
        status: true,
        dueDate: true,
        project: { select: PROJECT_BRIEF },
      },
      orderBy: [{ severity: 'desc' }, { reportedAt: 'desc' }],
    }),
    listPendingApprovals(principal),
    db.commentMention.findMany({
      where: { userId: principal.id, comment: { project: projectScope, deletedAt: null } },
      select: {
        id: true,
        comment: {
          select: {
            id: true,
            body: true,
            createdAt: true,
            status: true,
            author: { select: { name: true } },
            project: { select: PROJECT_BRIEF },
          },
        },
      },
      orderBy: { comment: { createdAt: 'desc' } },
      take: 20,
    }),
  ]);

  return {
    now: clock.now(),
    assignedProjects,
    nextActions,
    blockers,
    issues,
    approvals: approvals.filter((approval) => approval.mine),
    mentions,
  };
}

export async function listMerchants(principal: Principal) {
  if (!can(principal, 'merchant:read')) return [];
  return db.merchant.findMany({
    where: { deletedAt: null, projects: { some: scope(principal) } },
    select: {
      id: true,
      name: true,
      website: true,
      shoplineStoreId: true,
      currentPlatform: true,
      country: true,
      industry: true,
      contacts: {
        select: { id: true, name: true, email: true, phone: true, title: true, isPrimary: true },
        orderBy: { isPrimary: 'desc' },
      },
      projects: {
        where: scope(principal),
        select: { id: true, code: true, stage: true, health: true, targetLaunchDate: true },
        orderBy: { createdAt: 'desc' },
      },
    },
    orderBy: { name: 'asc' },
  });
}

export async function listPeople(principal: Principal) {
  if (!can(principal, 'user:read')) return [];
  return db.user.findMany({
    where: { deletedAt: null },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      team: true,
      title: true,
      isActive: true,
      lastLoginAt: true,
      _count: {
        select: {
          managedProjects: true,
          developedProjects: true,
          accountManagedProject: true,
          engineeredProjects: true,
        },
      },
    },
    orderBy: [{ team: 'asc' }, { name: 'asc' }],
  });
}

export async function listAuditLog(principal: Principal, limit = 200) {
  if (!can(principal, 'audit:read')) return [];
  return db.auditLog.findMany({
    where: { OR: [{ project: scope(principal) }, { projectId: null }] },
    select: {
      id: true,
      action: true,
      entityType: true,
      entityId: true,
      reason: true,
      occurredAt: true,
      ip: true,
      actor: { select: { id: true, name: true, role: true } },
      project: { select: { code: true, merchant: { select: { name: true } } } },
    },
    orderBy: { occurredAt: 'desc' },
    take: limit,
  });
}

export async function listOutbox(principal: Principal, limit = 50) {
  if (!can(principal, 'integration:manage')) return [];
  return db.outboxMessage.findMany({
    where: { OR: [{ project: scope(principal) }, { projectId: null }] },
    select: {
      id: true,
      provider: true,
      kind: true,
      status: true,
      attempts: true,
      lastError: true,
      createdAt: true,
      deliveredAt: true,
      project: { select: { code: true, merchant: { select: { name: true } } } },
    },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });
}
