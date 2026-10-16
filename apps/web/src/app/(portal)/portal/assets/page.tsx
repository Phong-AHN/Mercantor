import type { Metadata } from 'next';
import { ASSET_STATUS_LABEL, formatDate } from '@relay/core';
import { Alert, Badge, Card, CardHeader, Empty, ProgressBar } from '@relay/ui';
import {
  AssetStatusPicker,
  AttachLinkButton,
  FileUploadButton,
} from '@/app/(app)/projects/[code]/access/access-controls';
import { AssetRequirementsSummary } from '@/app/(app)/projects/[code]/assets/asset-requirements';
import { DueDate } from '@/components/domain';
import {
  assetWaitingOnMerchant,
  plainAssetItem,
  shownOnPortalAssets,
} from '@/features/portal/merchant-copy';
import { findPortalProject } from '@/features/portal/queries';
import { requirePrincipalOrRedirect } from '@/server/session';
import { ApproveRedirectButton, StuckButton } from '../merchant-help';
import { NoPortalProject } from '../no-project';

export const metadata: Metadata = { title: 'Assets' };
export const dynamic = 'force-dynamic';

export default async function PortalAssetsPage() {
  const principal = await requirePrincipalOrRedirect('/portal/assets');
  const project = await findPortalProject(principal);
  if (!project) return <NoPortalProject />;
  const now = project.snapshot.time.now;

  // Store login handover is tracked on the Access page; listing it here too
  // only asked for the same thing twice.
  const items = project.assetItems.filter(shownOnPortalAssets);
  const approved = items.filter((item) => item.status === 'APPROVED').length;
  const waiting = items.filter(assetWaitingOnMerchant);
  const notify = [project.people.ahnPm?.id, project.people.shoplineAm?.id].filter(
    (id): id is string => !!id,
  );
  const redirectLinks =
    project.scopeItems.find((scope) => scope.category === 'REDIRECTS')?.sourceCount ?? null;

  return (
    <div className="space-y-4">
      {waiting.length > 0 ? (
        <Alert
          tone="warning"
          title={
            waiting.length === 1
              ? `One thing is waiting on you: ${plainAssetItem(waiting[0]!).title}`
              : `${waiting.length} things are waiting on you`
          }
        >
          {waiting.length > 1 &&
            `${waiting.map((item) => plainAssetItem(item).title).join(', ')}. `}
          Share a link to wherever the files live, or upload them, then mark each one as sent.
        </Alert>
      ) : items.length > 0 ? (
        <Alert tone="success" title="Nothing is waiting on you here">
          Thank you - we have every file we need for now.
        </Alert>
      ) : null}

      <Card>
        <CardHeader
          title="Files we need from you"
          description="Brand files, product details and policies. A link to a shared folder is fine."
          actions={
            <div className="w-32">
              <ProgressBar
                value={items.length === 0 ? 0 : (approved / items.length) * 100}
                size="sm"
                tone={approved === items.length ? 'success' : 'accent'}
                label="Files approved"
              />
            </div>
          }
        />

        {items.length === 0 ? (
          <Empty title="Nothing requested yet" className="py-10" />
        ) : (
          <ul className="divide-line divide-y">
            {items.map((item) => {
              const plain = plainAssetItem(item);
              const done = item.status === 'APPROVED';
              const isRedirectList = item.kind === 'REDIRECT_MAP';
              const attachments = project.attachments.filter(
                (attachment) => attachment.assetItemId === item.id,
              );
              const readyToApprove =
                isRedirectList && !done && (item.status === 'RECEIVED' || attachments.length > 0);
              return (
                <li key={item.id} className="px-5 py-4">
                  <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2">
                    <div className="min-w-[16rem] flex-1">
                      <p className="text-ink flex items-center gap-2 text-[13.5px] font-medium leading-5">
                        {plain.title}
                        {item.required && !done && (
                          <Badge tone="warning" size="sm" variant="outline">
                            required
                          </Badge>
                        )}
                      </p>
                      {plain.help && (
                        <p className="text-muted mt-0.5 max-w-[65ch] text-[12.5px] leading-5">
                          {plain.help}
                        </p>
                      )}
                      {!done && !isRedirectList && (
                        <AssetRequirementsSummary
                          requiredFileTypes={item.requiredFileTypes}
                          requiredDimensions={item.requiredDimensions}
                          maxSizeMb={item.maxSizeMb}
                        />
                      )}
                      <p className="text-faint mt-1 flex flex-wrap gap-x-3 text-[11.5px]">
                        {/* Once approved, the due date is history - only the approval matters. */}
                        {done && item.approvedAt ? (
                          <span className="text-success-ink">
                            approved {formatDate(item.approvedAt)}
                          </span>
                        ) : (
                          item.dueDate && (
                            <span>
                              due <DueDate date={item.dueDate} now={now} />
                            </span>
                          )
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
                      {isRedirectList && !done && !readyToApprove && (
                        <p className="text-muted mt-2 text-[12.5px]">
                          Your team is preparing this list. You will be able to check and approve it
                          here.
                        </p>
                      )}
                    </div>

                    <div className="flex shrink-0 flex-col items-end gap-1.5">
                      {done ? (
                        <Badge tone={ASSET_STATUS_LABEL.APPROVED.tone} size="sm">
                          {ASSET_STATUS_LABEL.APPROVED.label}
                        </Badge>
                      ) : isRedirectList ? (
                        readyToApprove && (
                          <ApproveRedirectButton
                            code={project.code}
                            itemId={item.id}
                            links={redirectLinks}
                          />
                        )
                      ) : (
                        <AssetStatusPicker
                          code={project.code}
                          itemId={item.id}
                          status={item.status}
                          options={['RECEIVED']}
                          labels={{ RECEIVED: "I've sent this" }}
                        />
                      )}
                      {!done && (
                        <div className="flex flex-wrap justify-end gap-1">
                          {!isRedirectList && (
                            <>
                              <AttachLinkButton
                                code={project.code}
                                assetItemId={item.id}
                                label={plain.title}
                              />
                              <FileUploadButton code={project.code} assetItemId={item.id} />
                            </>
                          )}
                          {notify.length > 0 && (
                            <StuckButton
                              code={project.code}
                              itemTitle={plain.title}
                              notifyUserIds={notify}
                            />
                          )}
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
