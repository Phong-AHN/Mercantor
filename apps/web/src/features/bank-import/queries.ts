import { db } from '@relay/db';
import type { Principal } from '@relay/rbac';

/**
 * Organization-scoped, not the `projectScopeWhere` predicate every other
 * list in this app uses - most rows have no project at all, so filtering by
 * project visibility would hide the very rows this page exists to show.
 */
export async function listBankTransactions(principal: Principal, take = 100) {
  if (!principal.organizationId) return [];
  return db.bankTransaction.findMany({
    where: { organizationId: principal.organizationId },
    select: {
      id: true,
      direction: true,
      amount: true,
      currency: true,
      recipientName: true,
      recipientBank: true,
      recipientAccountNumber: true,
      content: true,
      transactionRef: true,
      status: true,
      occurredAt: true,
      createdAt: true,
      screenshotUrl: true,
      project: { select: { code: true, merchant: { select: { name: true } } } },
      importedBy: { select: { name: true } },
    },
    orderBy: [{ occurredAt: 'desc' }, { createdAt: 'desc' }],
    take,
  });
}
