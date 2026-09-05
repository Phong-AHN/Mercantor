import type { Metadata } from 'next';
import { clock, formatDate, formatMoney, INVOICE_STATUS_LABEL } from '@relay/core';
import { can } from '@relay/rbac';
import {
  Alert,
  Card,
  CardHeader,
  Empty,
  Mono,
  PageHeader,
  PermissionDenied,
  Stat,
  StatusPill,
  Table,
  TableScroller,
  TBody,
  TD,
  TH,
  THead,
  TR,
} from '@relay/ui';
import { DueDate, ProjectLink, StagePill } from '@/components/domain';
import { listInvoices } from '@/features/workspace/queries';
import { requirePrincipalOrRedirect } from '@/server/session';

export const metadata: Metadata = { title: 'Invoices' };
export const dynamic = 'force-dynamic';

export default async function InvoicesPage() {
  const principal = await requirePrincipalOrRedirect('/invoices');
  if (!can(principal, 'invoice:read')) return <PermissionDenied />;

  const invoices = await listInvoices(principal);
  const now = clock.now();
  const currency = invoices[0]?.currency ?? 'USD';

  const invoiced = invoices
    .filter((invoice) => invoice.status !== 'NOT_INVOICED')
    .reduce((sum, invoice) => sum + invoice.amountMinor, 0);
  const paid = invoices.reduce((sum, invoice) => sum + invoice.paidMinor, 0);
  const outstanding = invoiced - paid;

  const isOverdue = (invoice: (typeof invoices)[number]) =>
    invoice.status !== 'NOT_INVOICED' &&
    invoice.dueDate !== null &&
    invoice.dueDate.getTime() < now.getTime() &&
    invoice.paidMinor < invoice.amountMinor;

  const overdue = invoices.filter(isOverdue);
  const overdueValue = overdue.reduce(
    (sum, invoice) => sum + (invoice.amountMinor - invoice.paidMinor),
    0,
  );

  return (
    <div className="space-y-5">
      <PageHeader
        title="Invoices"
        description="Milestone billing across the portfolio. This is the answer to 'has AHN been paid' on every project at once."
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Invoiced"
          value={formatMoney(invoiced, currency, { compact: true })}
          detail={`${invoices.length} milestone row(s)`}
          tone="neutral"
        />
        <Stat
          label="Paid"
          value={formatMoney(paid, currency, { compact: true })}
          detail={invoiced > 0 ? `${Math.round((paid / invoiced) * 100)}% collected` : '-'}
          tone="success"
        />
        <Stat
          label="Outstanding"
          value={formatMoney(outstanding, currency, { compact: true })}
          detail={outstanding > 0 ? 'Not yet received' : 'Nothing outstanding'}
          tone={outstanding > 0 ? 'warning' : 'success'}
        />
        <Stat
          label="Overdue"
          value={formatMoney(overdueValue, currency, { compact: true })}
          detail={`${overdue.length} invoice(s) past their due date`}
          tone={overdue.length > 0 ? 'danger' : 'success'}
        />
      </div>

      {overdue.length > 0 && (
        <Alert tone="danger" title={`${overdue.length} overdue invoice(s)`}>
          Each of these makes its project At Risk on the dashboard until it is settled.
        </Alert>
      )}

      <Card>
        <CardHeader
          title="All milestones"
          count={invoices.length}
          description="Sorted by due date, so the next thing to chase is at the top."
        />
        {invoices.length === 0 ? (
          <Empty title="Nothing invoiced yet" className="py-12" />
        ) : (
          <TableScroller className="rounded-none border-0 shadow-none">
            <Table>
              <THead>
                <tr>
                  <TH className="min-w-[13rem]">Project</TH>
                  <TH className="min-w-[11rem]">Milestone</TH>
                  <TH>Number</TH>
                  <TH>Status</TH>
                  <TH numeric>Amount</TH>
                  <TH numeric>Outstanding</TH>
                  <TH>Invoiced</TH>
                  <TH>Due</TH>
                </tr>
              </THead>
              <TBody>
                {invoices.map((invoice) => {
                  const remaining = invoice.amountMinor - invoice.paidMinor;
                  return (
                    <TR key={invoice.id} interactive>
                      <TD>
                        <ProjectLink
                          code={invoice.project.code}
                          name={invoice.project.merchant.name}
                        />
                        <div className="mt-1">
                          <StagePill stage={invoice.project.stage} size="sm" />
                        </div>
                      </TD>
                      <TD className="text-ink text-[13px]">{invoice.milestone}</TD>
                      <TD>
                        {invoice.number ? (
                          <Mono>{invoice.number}</Mono>
                        ) : (
                          <span className="text-faint">-</span>
                        )}
                      </TD>
                      <TD>
                        <StatusPill
                          descriptor={
                            isOverdue(invoice)
                              ? INVOICE_STATUS_LABEL.OVERDUE
                              : INVOICE_STATUS_LABEL[invoice.status]
                          }
                          size="sm"
                        />
                      </TD>
                      <TD numeric className="font-medium">
                        {formatMoney(invoice.amountMinor, invoice.currency)}
                      </TD>
                      <TD
                        numeric
                        className={remaining > 0 ? 'text-warning-ink font-medium' : 'text-faint'}
                      >
                        {remaining > 0 ? formatMoney(remaining, invoice.currency) : '-'}
                      </TD>
                      <TD className="text-muted text-[12.5px]">
                        {invoice.invoiceDate ? formatDate(invoice.invoiceDate) : '-'}
                      </TD>
                      <TD>
                        <DueDate date={invoice.dueDate} now={now} />
                      </TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
          </TableScroller>
        )}
      </Card>
    </div>
  );
}
