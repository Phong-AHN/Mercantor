import { ASSET_STATUS_LABEL, ASSET_STATUSES, formatDate, type AssetStatus } from '@relay/core';
import { can } from '@relay/rbac';
import { Alert, Badge, Card, CardHeader, Empty, ProgressBar, Stat } from '@relay/ui';
import { DueDate } from '@/components/domain';
import { getProject } from '@/features/projects/queries';
import { requirePrincipalOrRedirect } from '@/server/session';
import { AssetStatusPicker, AttachLinkButton, FileUploadButton } from '../access/access-controls';

export const dynamic = 'force-dynamic';

const MERCHANT_OPTIONS: AssetStatus[] = ['RECEIVED'];

export default async function ProjectAssetsPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const principal = await requirePrincipalOrRedirect(`/projects/${code}/assets`);
  const project = await getProject(principal, code);
  const now = project.snapshot.time.now;

  const manage = can(principal, 'asset:manage');
  const upload = can(principal, 'asset:upload');
  const options = manage ? [...ASSET_STATUSES] : upload ? MERCHANT_OPTIONS : [];

  const items = project.assetItems;
  const required = items.filter((item) => item.required);
  const approved = items.filter((item) => item.status === 'APPROVED').length;
  const outstanding = required.filter(
    (item) => item.status === 'NOT_REQUESTED' || item.status === 'REQUESTED',
  );
  const awaitingApproval = items.filter((item) => item.status === 'RECEIVED');

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat
          label="Approved"
          value={`${approved} / ${items.length}`}
          detail="Received and checked by AHN"
          tone={approved === items.length ? 'success' : 'accent'}
        />
        <Stat
          label="Still needed"
          value={outstanding.length}
          detail={
            outstanding.length === 0
              ? 'Everything required has arrived'
              : outstanding
                  .slice(0, 3)
                  .map((item) => item.label)
                  .join(', ')
          }
          tone={outstanding.length === 0 ? 'success' : 'warning'}
        />
        <Stat
          label="Waiting on AHN"
          value={awaitingApproval.length}
          detail="Received but not yet approved"
          tone={awaitingApproval.length === 0 ? 'success' : 'info'}
        />
      </div>

      {outstanding.length > 0 && (
        <Alert tone="warning" title="Required assets are still outstanding">
          {outstanding.map((item) => item.label).join(', ')}.
        </Alert>
      )}

      <Card>
        <CardHeader
          title="Required merchant assets"
          description="The standard onboarding checklist. Files and links attach to the item they belong to, so nothing lives only in an email thread."
          actions={
            <div className="w-40">
              <ProgressBar
                value={items.length === 0 ? 0 : (approved / items.length) * 100}
                size="sm"
                tone={approved === items.length ? 'success' : 'accent'}
                label="Assets approved"
              />
            </div>
          }
        />

        {items.length === 0 ? (
          <Empty title="No asset checklist yet" className="py-10" />
        ) : (
          <ul className="divide-line divide-y">
            {items.map((item) => {
              const attachments = project.attachments.filter(
                (attachment) => attachment.assetItemId === item.id,
              );
              return (
                <li key={item.id} className="px-5 py-3.5">
                  <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2">
                    <div className="min-w-[16rem] flex-1">
                      <p className="text-ink flex items-center gap-2 text-[13.5px] font-medium leading-5">
                        {item.label}
                        {item.required ? (
                          <Badge tone="warning" size="sm" variant="outline">
                            required
                          </Badge>
                        ) : (
                          <Badge tone="muted" size="sm" variant="outline">
                            optional
                          </Badge>
                        )}
                      </p>
                      {item.notes && (
                        <p className="text-muted mt-0.5 text-[12px] leading-4">{item.notes}</p>
                      )}
                      <p className="text-faint mt-1 flex flex-wrap items-center gap-x-3 text-[11.5px]">
                        {item.dueDate && (
                          <span>
                            due <DueDate date={item.dueDate} now={now} />
                          </span>
                        )}
                        {item.receivedAt && <span>received {formatDate(item.receivedAt)}</span>}
                        {item.approvedAt && <span>approved {formatDate(item.approvedAt)}</span>}
                      </p>
                      {attachments.length > 0 && (
                        <ul className="mt-1.5 flex flex-wrap gap-2">
                          {attachments.map((attachment) => (
                            <li key={attachment.id}>
                              <a
                                href={attachment.url}
                                target="_blank"
                                rel="noreferrer noopener"
                                className="bg-surface-2 text-accent-ink rounded-full px-2 py-0.5 text-[11.5px] underline-offset-4 hover:underline"
                              >
                                {attachment.label}
                              </a>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>

                    <div className="flex shrink-0 flex-col items-end gap-1.5">
                      {options.length > 0 ? (
                        <AssetStatusPicker
                          code={project.code}
                          itemId={item.id}
                          status={item.status}
                          options={options}
                        />
                      ) : (
                        <Badge tone={ASSET_STATUS_LABEL[item.status].tone} size="sm" dot>
                          {ASSET_STATUS_LABEL[item.status].label}
                        </Badge>
                      )}
                      {(manage || upload) && (
                        <div className="flex flex-wrap justify-end gap-1">
                          <AttachLinkButton
                            code={project.code}
                            assetItemId={item.id}
                            label={item.label}
                          />
                          <FileUploadButton code={project.code} assetItemId={item.id} />
                        </div>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
