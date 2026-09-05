import type { Metadata } from 'next';
import { ASSET_STATUS_LABEL, formatDate } from '@relay/core';
import { Alert, Badge, Card, CardHeader, Empty, ProgressBar } from '@relay/ui';
import {
  AssetStatusPicker,
  AttachLinkButton,
  FileUploadButton,
} from '@/app/(app)/projects/[code]/access/access-controls';
import { DueDate } from '@/components/domain';
import { getPortalProject } from '@/features/portal/queries';
import { requirePrincipalOrRedirect } from '@/server/session';

export const metadata: Metadata = { title: 'Assets' };
export const dynamic = 'force-dynamic';

export default async function PortalAssetsPage() {
  const principal = await requirePrincipalOrRedirect('/portal/assets');
  const project = await getPortalProject(principal);
  const now = project.snapshot.time.now;

  const items = project.assetItems;
  const approved = items.filter((item) => item.status === 'APPROVED').length;
  const outstanding = items.filter(
    (item) => item.required && (item.status === 'NOT_REQUESTED' || item.status === 'REQUESTED'),
  );

  return (
    <div className="space-y-4">
      {outstanding.length > 0 && (
        <Alert tone="warning" title={`${outstanding.length} item(s) still needed from you`}>
          Attach a link to a shared folder, or mark an item as sent once it is with AHN.
        </Alert>
      )}

      <Card>
        <CardHeader
          title="Assets we need from you"
          description="Brand files, product data, policies and the redirect map. Attach a link to wherever they live."
          actions={
            <div className="w-32">
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
          <Empty title="Nothing requested yet" className="py-10" />
        ) : (
          <ul className="divide-line divide-y">
            {items.map((item) => {
              const attachments = project.attachments.filter(
                (attachment) => attachment.assetItemId === item.id,
              );
              return (
                <li key={item.id} className="px-5 py-4">
                  <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2">
                    <div className="min-w-[16rem] flex-1">
                      <p className="text-ink flex items-center gap-2 text-[13.5px] font-medium leading-5">
                        {item.label}
                        {item.required && (
                          <Badge tone="warning" size="sm" variant="outline">
                            required
                          </Badge>
                        )}
                      </p>
                      {item.notes && (
                        <p className="text-muted mt-0.5 text-[12px] leading-4">{item.notes}</p>
                      )}
                      <p className="text-faint mt-1 flex flex-wrap gap-x-3 text-[11.5px]">
                        {item.dueDate && (
                          <span>
                            due <DueDate date={item.dueDate} now={now} />
                          </span>
                        )}
                        {item.approvedAt && (
                          <span className="text-success-ink">
                            approved {formatDate(item.approvedAt)}
                          </span>
                        )}
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
                      {item.status === 'APPROVED' ? (
                        <Badge tone={ASSET_STATUS_LABEL.APPROVED.tone} size="sm" dot>
                          {ASSET_STATUS_LABEL.APPROVED.label}
                        </Badge>
                      ) : (
                        <AssetStatusPicker
                          code={project.code}
                          itemId={item.id}
                          status={item.status}
                          options={['RECEIVED']}
                        />
                      )}
                      <div className="flex flex-wrap justify-end gap-1">
                        <AttachLinkButton
                          code={project.code}
                          assetItemId={item.id}
                          label={item.label}
                        />
                        <FileUploadButton code={project.code} assetItemId={item.id} />
                      </div>
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
