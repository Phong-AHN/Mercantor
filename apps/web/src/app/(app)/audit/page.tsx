import type { Metadata } from 'next';
import { clock, formatDateTime, formatRelative, USER_ROLE_LABEL } from '@relay/core';
import { can } from '@relay/rbac';
import {
  Alert,
  Badge,
  Card,
  CardHeader,
  Empty,
  Mono,
  PageHeader,
  PermissionDenied,
  Table,
  TableScroller,
  TBody,
  TD,
  TH,
  THead,
  TR,
} from '@relay/ui';
import { listAuditLog } from '@/features/workspace/queries';
import { requirePrincipalOrRedirect } from '@/server/session';

export const metadata: Metadata = { title: 'Audit log' };
export const dynamic = 'force-dynamic';

export default async function AuditPage() {
  const principal = await requirePrincipalOrRedirect('/audit');
  if (!can(principal, 'audit:read')) return <PermissionDenied />;

  const entries = await listAuditLog(principal);
  const now = clock.now();

  return (
    <div className="space-y-5">
      <PageHeader
        title="Audit log"
        description="Every write that crossed a permission boundary, recorded in the same transaction as the change itself."
      />

      <Alert tone="info" dense>
        Reads are never audited. Writes are, and the row cannot drift from the change - if the
        transaction rolled back, so did the log entry.
      </Alert>

      <Card>
        <CardHeader title="Recent activity" count={entries.length} />
        {entries.length === 0 ? (
          <Empty title="Nothing recorded yet" className="py-14" />
        ) : (
          <TableScroller className="rounded-none border-0 shadow-none">
            <Table>
              <THead>
                <tr>
                  <TH>When</TH>
                  <TH className="min-w-[12rem]">Who</TH>
                  <TH className="min-w-[13rem]">Action</TH>
                  <TH className="min-w-[12rem]">Project</TH>
                  <TH>Entity</TH>
                  <TH className="min-w-[14rem]">Reason</TH>
                  <TH>IP</TH>
                </tr>
              </THead>
              <TBody>
                {entries.map((entry) => (
                  <TR key={entry.id}>
                    <TD>
                      <span
                        className="text-ink text-[12.5px]"
                        title={formatDateTime(entry.occurredAt)}
                      >
                        {formatRelative(entry.occurredAt, now)}
                      </span>
                    </TD>
                    <TD>
                      {entry.actor ? (
                        <>
                          <span className="text-ink block text-[12.5px] font-medium">
                            {entry.actor.name}
                          </span>
                          <Badge tone={USER_ROLE_LABEL[entry.actor.role].tone} size="sm">
                            {USER_ROLE_LABEL[entry.actor.role].label}
                          </Badge>
                        </>
                      ) : (
                        <span className="text-faint text-[12.5px]">system</span>
                      )}
                    </TD>
                    <TD>
                      <Mono>{entry.action}</Mono>
                    </TD>
                    <TD className="text-ink-soft text-[12.5px]">
                      {entry.project
                        ? `${entry.project.merchant.name} (${entry.project.code})`
                        : '-'}
                    </TD>
                    <TD className="text-muted text-[12px]">{entry.entityType}</TD>
                    <TD className="text-muted text-[12px]">{entry.reason ?? '-'}</TD>
                    <TD className="text-faint font-mono text-[11px]">{entry.ip ?? '-'}</TD>
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
