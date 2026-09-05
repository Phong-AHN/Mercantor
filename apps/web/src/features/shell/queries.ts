import 'server-only';
import { cache } from 'react';
import { canDecideApproval, projectScopeWhere, can, type Principal } from '@relay/rbac';
import { db, type Prisma } from '@relay/db';

/**
 * Everything the chrome needs, in one place and one round trip per counter.
 * The counts respect the same project scope as the pages, so a merchant never
 * sees a badge for work they cannot open.
 */
export const getShellData = cache(async (principal: Principal) => {
  const scope = projectScopeWhere(principal) as Prisma.ProjectWhereInput;

  const decidableApprovalTypes = (
    ['DESIGN', 'DEVELOPMENT', 'QA', 'MERCHANT_FINAL', 'SHOPLINE_DEPLOYMENT'] as const
  ).filter((type) => canDecideApproval(principal, type));

  const [notifications, unread, blockers, approvals, handoffs] = await Promise.all([
    db.notification.findMany({
      where: { userId: principal.id },
      select: {
        id: true,
        type: true,
        title: true,
        body: true,
        href: true,
        createdAt: true,
        readAt: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 12,
    }),
    db.notification.count({ where: { userId: principal.id, readAt: null } }),
    can(principal, 'blocker:read')
      ? db.blocker.count({ where: { resolvedAt: null, project: scope } })
      : Promise.resolve(0),
    decidableApprovalTypes.length > 0
      ? db.approval.count({
          where: { status: 'PENDING', type: { in: decidableApprovalTypes }, project: scope },
        })
      : Promise.resolve(0),
    can(principal, 'handoff:decide') || can(principal, 'handoff:submit')
      ? db.handoffSubmission.count({ where: { decision: 'PENDING', project: scope } })
      : Promise.resolve(0),
  ]);

  return {
    notifications: notifications.map((notification) => ({
      id: notification.id,
      type: notification.type,
      title: notification.title,
      body: notification.body,
      href: notification.href,
      createdAt: notification.createdAt.toISOString(),
      read: notification.readAt !== null,
    })),
    badges: {
      notifications: unread,
      blockers,
      approvals,
      handoffs,
    },
  };
});
