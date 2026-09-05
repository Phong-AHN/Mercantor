import {
  formatDate,
  formatMoney,
  MIGRATION_TYPE_LABEL,
  SCOPE_DISPOSITION_LABEL,
  SCOPE_STATUS_LABEL,
} from '@relay/core';
import { can } from '@relay/rbac';
import {
  Alert,
  Badge,
  Card,
  CardBody,
  CardHeader,
  Empty,
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
import { getProject } from '@/features/projects/queries';
import { requirePrincipalOrRedirect } from '@/server/session';
import { ApproveChangeRequestButton, ScopeRowControls } from './scope-controls';

export const dynamic = 'force-dynamic';

/**
 * Scope, with the one thing the brief is emphatic about: anything outside the
 * agreed scope is flagged, not quietly absorbed.
 */
export default async function ProjectScopePage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const principal = await requirePrincipalOrRedirect(`/projects/${code}/scope`);
  const project = await getProject(principal, code);
  const manage = can(principal, 'scope:manage');
  const showMoney = can(principal, 'invoice:read');
  const approveMoney = can(principal, 'invoice:manage');

  const inScope = project.scopeItems.filter((item) => item.disposition === 'IN_SCOPE');
  const outOfScope = project.scopeItems.filter((item) => item.disposition === 'OUT_OF_SCOPE');
  const changeRequests = project.scopeItems.filter((item) => item.disposition === 'CHANGE_REQUEST');

  const verified = inScope.filter((item) => item.status === 'VERIFIED').length;
  const totalSource = inScope.reduce((sum, item) => sum + (item.sourceCount ?? 0), 0);
  const totalMigrated = inScope.reduce((sum, item) => sum + (item.migratedCount ?? 0), 0);
  const changeRequestValue = changeRequests.reduce(
    (sum, item) => sum + (item.changeRequestAmountMinor ?? 0),
    0,
  );

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Migration type"
          value={MIGRATION_TYPE_LABEL[project.migrationType].label}
          detail={MIGRATION_TYPE_LABEL[project.migrationType].hint}
          tone={MIGRATION_TYPE_LABEL[project.migrationType].tone}
        />
        <Stat
          label="Verified"
          value={`${verified} / ${inScope.length}`}
          detail="Data sets checked against the source store"
          tone={verified === inScope.length && inScope.length > 0 ? 'success' : 'accent'}
        />
        <Stat
          label="Records migrated"
          value={totalMigrated.toLocaleString('en-US')}
          detail={`of ${totalSource.toLocaleString('en-US')} in the source store`}
          tone={totalMigrated >= totalSource && totalSource > 0 ? 'success' : 'info'}
        />
        <Stat
          label="Change requests"
          value={changeRequests.length}
          detail={
            showMoney && changeRequestValue > 0
              ? `${formatMoney(changeRequestValue, project.snapshot.invoice.currency)} of additional scope`
              : 'Outside the agreed scope'
          }
          tone={changeRequests.length === 0 ? 'success' : 'warning'}
        />
      </div>

      {project.scopeSummary && (
        <Alert tone="info" title="Agreed scope">
          {project.scopeSummary}
        </Alert>
      )}

      <Card>
        <CardHeader
          title="Data & content in scope"
          description="What is being migrated, how much of it there is, and how far it has got."
        />
        {inScope.length === 0 ? (
          <Empty title="Nothing is in scope yet" className="py-10" />
        ) : (
          <TableScroller className="rounded-none border-0 shadow-none">
            <Table>
              <THead>
                <tr>
                  <TH className="min-w-[12rem]">Item</TH>
                  <TH>Status</TH>
                  <TH numeric>Source</TH>
                  <TH numeric>Migrated</TH>
                  <TH className="min-w-[10rem]">Progress</TH>
                  <TH className="min-w-[14rem]">Notes</TH>
                  {manage && <TH>Update</TH>}
                </tr>
              </THead>
              <TBody>
                {inScope.map((item) => {
                  const pct =
                    item.sourceCount && item.sourceCount > 0
                      ? ((item.migratedCount ?? 0) / item.sourceCount) * 100
                      : item.status === 'VERIFIED'
                        ? 100
                        : 0;
                  return (
                    <TR key={item.id}>
                      <TD>
                        <span className="text-ink text-[13px] font-medium">{item.label}</span>
                      </TD>
                      <TD>
                        <StatusPill descriptor={SCOPE_STATUS_LABEL[item.status]} size="sm" />
                      </TD>
                      <TD numeric className="text-muted text-[12.5px]">
                        {item.sourceCount?.toLocaleString('en-US') ?? '-'}
                      </TD>
                      <TD numeric className="text-ink text-[12.5px]">
                        {item.migratedCount?.toLocaleString('en-US') ?? '-'}
                      </TD>
                      <TD>
                        <ProgressBar
                          value={pct}
                          size="sm"
                          tone={pct >= 100 ? 'success' : pct > 0 ? 'accent' : 'muted'}
                          label={`${item.label} progress`}
                        />
                      </TD>
                      <TD className="text-muted text-[12px]">{item.notes ?? '-'}</TD>
                      {manage && (
                        <TD>
                          <ScopeRowControls
                            code={project.code}
                            itemId={item.id}
                            label={item.label}
                            disposition={item.disposition}
                            status={item.status}
                            sourceCount={item.sourceCount}
                            migratedCount={item.migratedCount}
                            notes={item.notes}
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

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="Change requests"
            count={changeRequests.length}
            description="Work agreed after the original scope. Priced separately."
          />
          <CardBody>
            {changeRequests.length === 0 ? (
              <Empty title="No change requests" className="py-6" />
            ) : (
              <ul className="space-y-3">
                {changeRequests.map((item) => (
                  <li
                    key={item.id}
                    className="border-warning/35 bg-warning-soft rounded-[var(--radius-md)] border p-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-warning-ink text-[13px] font-medium">{item.label}</p>
                        {item.notes && (
                          <p className="text-warning-ink/85 mt-0.5 text-[12px]">{item.notes}</p>
                        )}
                      </div>
                      {showMoney && item.changeRequestAmountMinor !== null && (
                        <span className="tabular text-warning-ink shrink-0 text-[13px] font-semibold">
                          {formatMoney(
                            item.changeRequestAmountMinor,
                            project.snapshot.invoice.currency,
                          )}
                        </span>
                      )}
                    </div>
                    {showMoney && (
                      <div className="mt-2 flex items-center justify-between gap-3">
                        {item.changeRequestApprovedAt ? (
                          <Badge tone="success" size="sm" dot>
                            Approved {formatDate(item.changeRequestApprovedAt)} — on the invoice
                          </Badge>
                        ) : item.changeRequestAmountMinor === null ? (
                          <Badge tone="muted" size="sm" variant="outline">
                            Needs pricing
                          </Badge>
                        ) : (
                          <Badge tone="warning" size="sm" variant="outline">
                            Priced — awaiting approval
                          </Badge>
                        )}
                        {approveMoney &&
                          item.changeRequestAmountMinor !== null &&
                          !item.changeRequestApprovedAt && (
                            <ApproveChangeRequestButton code={project.code} itemId={item.id} />
                          )}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Explicitly out of scope"
            count={outOfScope.length}
            description="Agreed exclusions, recorded so nobody assumes otherwise later."
          />
          <CardBody>
            {outOfScope.length === 0 ? (
              <Empty title="Nothing excluded" className="py-6" />
            ) : (
              <ul className="flex flex-wrap gap-2">
                {outOfScope.map((item) => (
                  <li key={item.id}>
                    <StatusPill
                      descriptor={{
                        ...SCOPE_DISPOSITION_LABEL.OUT_OF_SCOPE,
                        label: item.label,
                      }}
                      size="sm"
                      dot={false}
                    />
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
