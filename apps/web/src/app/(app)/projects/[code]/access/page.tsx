import { ACCESS_STATUS_LABEL, ACCESS_STATUSES, formatDate, type AccessStatus } from '@relay/core';
import { can } from '@relay/rbac';
import { Alert, Badge, Card, CardHeader, Empty, ProgressBar, Stat } from '@relay/ui';
import { getProject } from '@/features/projects/queries';
import { requirePrincipalOrRedirect } from '@/server/session';
import { AccessStatusPicker, AttachLinkButton, FileUploadButton } from './access-controls';

export const dynamic = 'force-dynamic';

/** AHN can drive the whole ladder; a merchant can only say "here it is". */
const MERCHANT_OPTIONS: AccessStatus[] = ['REQUESTED', 'RECEIVED', 'ISSUE'];

export default async function ProjectAccessPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const principal = await requirePrincipalOrRedirect(`/projects/${code}/access`);
  const project = await getProject(principal, code);

  const manage = can(principal, 'access:manage');
  const provide = can(principal, 'access:provide');
  const options = manage ? [...ACCESS_STATUSES] : provide ? MERCHANT_OPTIONS : [];

  const items = project.accessItems;
  const verified = items.filter((item) => item.status === 'VERIFIED').length;
  const blocking = items.filter((item) => item.blocking);
  const blockingOutstanding = blocking.filter((item) => item.status !== 'VERIFIED');
  const issues = items.filter((item) => item.status === 'ISSUE');

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat
          label="Verified"
          value={`${verified} / ${items.length}`}
          detail="Credentials confirmed working"
          tone={verified === items.length ? 'success' : 'accent'}
        />
        <Stat
          label="Blocking migration"
          value={blockingOutstanding.length}
          detail={
            blockingOutstanding.length === 0
              ? 'Nothing is holding migration up'
              : blockingOutstanding.map((item) => item.label).join(', ')
          }
          tone={blockingOutstanding.length === 0 ? 'success' : 'danger'}
        />
        <Stat
          label="Reported problems"
          value={issues.length}
          detail={issues.length === 0 ? 'No access issues' : 'Credentials that do not work'}
          tone={issues.length === 0 ? 'success' : 'warning'}
        />
      </div>

      {blockingOutstanding.length > 0 && (
        <Alert tone="danger" title="This project is waiting on access">
          Migration cannot start until {blockingOutstanding.map((item) => item.label).join(', ')}{' '}
          {blockingOutstanding.length === 1 ? 'is' : 'are'} verified.
        </Alert>
      )}

      <Card>
        <CardHeader
          title="Access & credentials checklist"
          description="Not requested, requested, received, verified - or a problem. Received is not the same as verified, and only AHN can say a credential works."
          actions={
            <div className="w-40">
              <ProgressBar
                value={items.length === 0 ? 0 : (verified / items.length) * 100}
                size="sm"
                tone={verified === items.length ? 'success' : 'accent'}
                label="Access verified"
              />
            </div>
          }
        />

        {items.length === 0 ? (
          <Empty title="No access checklist yet" className="py-10" />
        ) : (
          <ul className="divide-line divide-y">
            {items.map((item) => {
              const attachments = project.attachments.filter(
                (attachment) => attachment.accessItemId === item.id,
              );
              return (
                <li key={item.id} className="px-5 py-3.5">
                  <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2">
                    <div className="min-w-[16rem] flex-1">
                      <p className="text-ink flex items-center gap-2 text-[13.5px] font-medium leading-5">
                        {item.label}
                        {item.blocking && (
                          <Badge tone="danger" size="sm" variant="outline">
                            blocking
                          </Badge>
                        )}
                      </p>
                      {item.notes && (
                        <p className="text-muted mt-0.5 text-[12px] leading-4">{item.notes}</p>
                      )}
                      <p className="text-faint mt-1 flex flex-wrap items-center gap-x-3 text-[11.5px]">
                        {item.requestedAt && <span>requested {formatDate(item.requestedAt)}</span>}
                        {item.receivedAt && <span>received {formatDate(item.receivedAt)}</span>}
                        {item.verifiedAt && <span>verified {formatDate(item.verifiedAt)}</span>}
                      </p>
                      {attachments.length > 0 && (
                        <ul className="mt-1.5 flex flex-wrap gap-2">
                          {attachments.map((attachment) => (
                            <li key={attachment.id}>
                              <a
                                href={attachment.url}
                                target="_blank"
                                rel="noreferrer noopener"
                                className="text-accent-ink text-[11.5px] underline-offset-4 hover:underline"
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
                        <AccessStatusPicker
                          code={project.code}
                          itemId={item.id}
                          status={item.status}
                          options={options}
                        />
                      ) : (
                        <Badge tone={ACCESS_STATUS_LABEL[item.status].tone} size="sm" dot>
                          {ACCESS_STATUS_LABEL[item.status].label}
                        </Badge>
                      )}
                      {(manage || provide) && (
                        <div className="flex flex-wrap justify-end gap-1">
                          <AttachLinkButton
                            code={project.code}
                            accessItemId={item.id}
                            label={item.label}
                          />
                          <FileUploadButton code={project.code} accessItemId={item.id} />
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
