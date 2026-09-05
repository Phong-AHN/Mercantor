import { formatDate, formatMoney, INVOICE_STATUS_LABEL } from '@relay/core';
import { can } from '@relay/rbac';
import {
  Alert,
  Badge,
  Card,
  CardHeader,
  Empty,
  Mono,
  PermissionDenied,
  ProgressBar,
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
import { DueDate } from '@/components/domain';
import { getProject } from '@/features/projects/queries';
import { requirePrincipalOrRedirect } from '@/server/session';
import { InvoiceControls, NewInvoiceButton } from './invoice-controls';

export const dynamic = 'force-dynamic';

export default async function ProjectInvoicesPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const principal = await requirePrincipalOrRedirect(`/projects/${code}/invoices`);

  if (!can(principal, 'invoice:read')) {
    return (
      <PermissionDenied
        title="Commercial detail is not part of your role"
        description="Project status, blockers and delivery are all still available to you."
      />
    );
  }

  const project = await getProject(principal, code);
  const manage = can(principal, 'invoice:manage');
  const rollup = project.snapshot.invoice;
  const now = project.snapshot.time.now;
  const currency = rollup.currency;

  const paidPct = rollup.invoicedMinor > 0 ? (rollup.paidMinor / rollup.invoicedMinor) * 100 : 0;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Contract value"
          value={formatMoney(project.contractTotalMinor || rollup.totalMinor, currency)}
          detail={`${rollup.count} milestone${rollup.count === 1 ? '' : 's'}`}
          tone="neutral"
        />
        <Stat
          label="Invoiced"
          value={formatMoney(rollup.invoicedMinor, currency)}
          detail={`${Math.round(paidPct)}% of it paid`}
          tone="info"
        />
        <Stat
          label="Paid"
          value={formatMoney(rollup.paidMinor, currency)}
          detail="Received by AHN"
          tone="success"
        />
        <Stat
          label="Outstanding"
          value={formatMoney(rollup.outstandingMinor, currency)}
          detail={rollup.nextDueDate ? `Next due ${formatDate(rollup.nextDueDate)}` : 'Nothing due'}
          tone={rollup.overdue ? 'danger' : rollup.outstandingMinor > 0 ? 'warning' : 'success'}
        />
      </div>

      {rollup.overdue && (
        <Alert tone="danger" title="An invoice is overdue">
          Overdue payment makes the project At Risk on the dashboard until it is settled.
        </Alert>
      )}

      <Card>
        <CardHeader
          title="Milestone billing"
          description="Deposits, stage payments and the final invoice. The project rollup is the sum of these rows."
          actions={
            <div className="flex items-center gap-3">
              <div className="hidden w-32 sm:block">
                <ProgressBar
                  value={paidPct}
                  size="sm"
                  tone={rollup.overdue ? 'danger' : paidPct >= 100 ? 'success' : 'accent'}
                  label="Paid against invoiced"
                />
              </div>
              {manage && <NewInvoiceButton code={project.code} currency={currency} />}
            </div>
          }
        />

        {project.invoices.length === 0 ? (
          <Empty
            title="Nothing invoiced yet"
            description="Add the milestones as they are agreed, so the outstanding balance is never a guess."
            className="py-12"
          />
        ) : (
          <TableScroller className="rounded-none border-0 shadow-none">
            <Table>
              <THead>
                <tr>
                  <TH className="min-w-[12rem]">Milestone</TH>
                  <TH>Number</TH>
                  <TH>Status</TH>
                  <TH numeric>Amount</TH>
                  <TH numeric>Paid</TH>
                  <TH numeric>Outstanding</TH>
                  <TH>Invoiced</TH>
                  <TH>Due</TH>
                  {manage && <TH>Actions</TH>}
                </tr>
              </THead>
              <TBody>
                {project.invoices.map((invoice) => {
                  const outstanding = invoice.amountMinor - invoice.paidMinor;
                  const overdue =
                    invoice.dueDate !== null &&
                    invoice.dueDate.getTime() < now.getTime() &&
                    outstanding > 0 &&
                    invoice.status !== 'NOT_INVOICED';

                  return (
                    <TR key={invoice.id}>
                      <TD>
                        <span className="text-ink text-[13px] font-medium">
                          {invoice.milestone}
                        </span>
                        {invoice.scopeItemId && (
                          <Badge tone="warning" size="sm" variant="outline" className="ml-2">
                            change request
                          </Badge>
                        )}
                        {invoice.notes && (
                          <span className="text-muted mt-0.5 block text-[11.5px]">
                            {invoice.notes}
                          </span>
                        )}
                      </TD>
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
                            overdue
                              ? INVOICE_STATUS_LABEL.OVERDUE
                              : INVOICE_STATUS_LABEL[invoice.status]
                          }
                          size="sm"
                        />
                      </TD>
                      <TD numeric className="font-medium">
                        {formatMoney(invoice.amountMinor, invoice.currency)}
                      </TD>
                      <TD numeric className="text-success-ink">
                        {formatMoney(invoice.paidMinor, invoice.currency)}
                      </TD>
                      <TD
                        numeric
                        className={outstanding > 0 ? 'text-warning-ink font-medium' : 'text-faint'}
                      >
                        {outstanding > 0 ? formatMoney(outstanding, invoice.currency) : '-'}
                      </TD>
                      <TD className="text-muted text-[12.5px]">
                        {invoice.invoiceDate ? formatDate(invoice.invoiceDate) : '-'}
                      </TD>
                      <TD>
                        <DueDate date={invoice.dueDate} now={now} />
                      </TD>
                      {manage && (
                        <TD>
                          <InvoiceControls
                            code={project.code}
                            invoice={{
                              id: invoice.id,
                              milestone: invoice.milestone,
                              number: invoice.number,
                              amount: invoice.amountMinor / 100,
                              paid: invoice.paidMinor / 100,
                              status: invoice.status,
                              invoiceDate: invoice.invoiceDate?.toISOString() ?? null,
                              dueDate: invoice.dueDate?.toISOString() ?? null,
                              notes: invoice.notes,
                              currency: invoice.currency,
                            }}
                          />
                        </TD>
                      )}
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
