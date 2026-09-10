import { NextResponse } from 'next/server';
import { db } from '@relay/db';
import { NotFoundError, toAppError } from '@relay/core';
import { can } from '@relay/rbac';
import { presignDownload } from '@relay/storage';
import { requirePrincipal } from '@/server/session';

/**
 * The only place a bank-import storage key leaves the server - mirrors
 * `/api/attachments/[id]`. Organization-scoped rather than project-scoped:
 * `BankTransaction` has no project on most rows.
 */
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const principal = await requirePrincipal();
    const { id } = await context.params;

    if (!can(principal, 'bank_transaction:read')) {
      throw new NotFoundError('That screenshot does not exist.');
    }

    const row = await db.bankTransaction.findUnique({
      where: { id },
      select: { organizationId: true, screenshotUrl: true, occurredAt: true },
    });
    if (!row || !row.screenshotUrl || row.organizationId !== principal.organizationId) {
      throw new NotFoundError('That screenshot does not exist.');
    }

    const filename = row.occurredAt
      ? `vietinbank-${row.occurredAt.toISOString().slice(0, 10)}.png`
      : 'vietinbank-screenshot.png';
    const url = await presignDownload(row.screenshotUrl, filename);
    return NextResponse.redirect(url);
  } catch (error) {
    const appError = toAppError(error);
    return NextResponse.json(appError.toJSON(), { status: appError.status });
  }
}
