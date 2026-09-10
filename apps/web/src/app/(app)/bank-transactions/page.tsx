import type { Metadata } from 'next';
import Link from 'next/link';
import { BANK_TRANSACTION_STATUS_LABEL, formatDate } from '@relay/core';
import { can } from '@relay/rbac';
import {
  Card,
  CardHeader,
  Empty,
  Mono,
  PageHeader,
  PermissionDenied,
  StatusPill,
  Table,
  TableScroller,
  TBody,
  TD,
  TH,
  THead,
  TR,
} from '@relay/ui';
import { listBankTransactions } from '@/features/bank-import/queries';
import { requirePrincipalOrRedirect } from '@/server/session';
import { BankImportPanel } from './import-form';

export const metadata: Metadata = { title: 'Bank transactions' };
export const dynamic = 'force-dynamic';

/**
 * Imported from screenshots of the bank app rather than typed in by hand -
 * see `@relay/core`'s `parseVietinbankOcrText` and
 * `features/bank-import/ocr.ts`. Organization-scoped: most rows are AHN's
 * own vendor payments with no project attached at all.
 */
export default async function BankTransactionsPage() {
  const principal = await requirePrincipalOrRedirect('/bank-transactions');
  if (!can(principal, 'bank_transaction:read')) return <PermissionDenied />;

  const transactions = await listBankTransactions(principal);
  const canImport = can(principal, 'bank_transaction:import');

  return (
    <div className="space-y-5">
      <PageHeader
        title="Bank transactions"
        description="Imported from screenshots of the VietinBank app - vendor payments and other expenses, not necessarily tied to a merchant."
      />

      {canImport && <BankImportPanel />}

      <Card>
        <CardHeader title="Imported transactions" count={transactions.length} />
        {transactions.length === 0 ? (
          <Empty
            title="No transactions imported yet"
            description={
              canImport
                ? 'Import a screenshot above to get started.'
                : 'Ask someone with import access to bring in a screenshot.'
            }
            className="py-14"
          />
        ) : (
          <TableScroller className="rounded-none border-0 shadow-none">
            <Table>
              <THead>
                <TR>
                  <TH>Date</TH>
                  <TH>Direction</TH>
                  <TH>Recipient</TH>
                  <TH>Bank / account</TH>
                  <TH>Content</TH>
                  <TH align="right">Amount</TH>
                  <TH>Status</TH>
                  <TH>Project</TH>
                  <TH>Screenshot</TH>
                </TR>
              </THead>
              <TBody>
                {transactions.map((row) => (
                  <TR key={row.id}>
                    <TD className="whitespace-nowrap">
                      {row.occurredAt ? formatDate(row.occurredAt) : '-'}
                    </TD>
                    <TD>{row.direction ?? '-'}</TD>
                    <TD className="max-w-55 truncate" title={row.recipientName ?? undefined}>
                      {row.recipientName ?? '-'}
                    </TD>
                    <TD className="max-w-50 truncate">
                      {row.recipientBank ? (
                        <>
                          {row.recipientBank}
                          {row.recipientAccountNumber && (
                            <Mono className="text-faint ml-1">{row.recipientAccountNumber}</Mono>
                          )}
                        </>
                      ) : (
                        '-'
                      )}
                    </TD>
                    <TD className="max-w-60 truncate" title={row.content ?? undefined}>
                      {row.content ?? '-'}
                    </TD>
                    <TD align="right" className="tabular whitespace-nowrap">
                      {row.amount.toLocaleString('vi-VN')} {row.currency}
                    </TD>
                    <TD>
                      <StatusPill
                        descriptor={BANK_TRANSACTION_STATUS_LABEL[row.status]}
                        size="sm"
                      />
                    </TD>
                    <TD>
                      {row.project ? (
                        <Link
                          href={`/projects/${row.project.code}`}
                          className="text-accent-ink underline-offset-4 hover:underline"
                        >
                          {row.project.merchant.name}
                        </Link>
                      ) : (
                        <span className="text-faint">-</span>
                      )}
                    </TD>
                    <TD>
                      {row.screenshotUrl ? (
                        <a
                          href={`/api/bank-transactions/${row.id}`}
                          target="_blank"
                          rel="noreferrer noopener"
                          className="text-accent-ink underline-offset-4 hover:underline"
                        >
                          View
                        </a>
                      ) : (
                        <span className="text-faint">-</span>
                      )}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </TableScroller>
        )}
      </Card>
    </div>
  );
}
