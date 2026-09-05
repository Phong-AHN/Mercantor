import type { Metadata } from 'next';
import { ACCESS_STATUS_LABEL, formatDate } from '@relay/core';
import { Alert, Badge, Card, CardHeader, Empty, ProgressBar } from '@relay/ui';
import {
  AccessStatusPicker,
  AttachLinkButton,
  FileUploadButton,
} from '@/app/(app)/projects/[code]/access/access-controls';
import { getPortalProject } from '@/features/portal/queries';
import { requirePrincipalOrRedirect } from '@/server/session';

export const metadata: Metadata = { title: 'Access' };
export const dynamic = 'force-dynamic';

/**
 * The merchant's side of the access checklist. They can say a credential has
 * been provided or that something is wrong with it; only AHN can say it works,
 * which is why VERIFIED is not one of the options here.
 */
export default async function PortalAccessPage() {
  const principal = await requirePrincipalOrRedirect('/portal/access');
  const project = await getPortalProject(principal);

  const items = project.accessItems;
  const verified = items.filter((item) => item.status === 'VERIFIED').length;
  const blocking = items.filter((item) => item.blocking && item.status !== 'VERIFIED');

  return (
    <div className="space-y-4">
      {blocking.length > 0 && (
        <Alert tone="warning" title="These are holding the migration up">
          {blocking.map((item) => item.label).join(', ')}. AHN cannot start moving your data until
          they have these.
        </Alert>
      )}

      <Card>
        <CardHeader
          title="Access we need from you"
          description="Mark an item as provided once you have shared the credentials. AHN will verify it works and confirm."
          actions={
            <div className="w-32">
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
          <Empty title="Nothing requested yet" className="py-10" />
        ) : (
          <ul className="divide-line divide-y">
            {items.map((item) => (
              <li key={item.id} className="px-5 py-4">
                <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2">
                  <div className="min-w-[16rem] flex-1">
                    <p className="text-ink flex items-center gap-2 text-[13.5px] font-medium leading-5">
                      {item.label}
                      {item.blocking && (
                        <Badge tone="danger" size="sm" variant="outline">
                          needed to start
                        </Badge>
                      )}
                    </p>
                    {item.notes && (
                      <p className="text-muted mt-0.5 text-[12px] leading-4">{item.notes}</p>
                    )}
                    {item.verifiedAt && (
                      <p className="text-success-ink mt-1 text-[11.5px]">
                        Verified by AHN on {formatDate(item.verifiedAt)}
                      </p>
                    )}
                  </div>

                  <div className="flex shrink-0 flex-col items-end gap-1.5">
                    {item.status === 'VERIFIED' ? (
                      <Badge tone={ACCESS_STATUS_LABEL.VERIFIED.tone} size="sm" dot>
                        {ACCESS_STATUS_LABEL.VERIFIED.label}
                      </Badge>
                    ) : (
                      <AccessStatusPicker
                        code={project.code}
                        itemId={item.id}
                        status={item.status}
                        options={['REQUESTED', 'RECEIVED', 'ISSUE']}
                      />
                    )}
                    <div className="flex flex-wrap justify-end gap-1">
                      <AttachLinkButton
                        code={project.code}
                        accessItemId={item.id}
                        label={item.label}
                      />
                      <FileUploadButton code={project.code} accessItemId={item.id} />
                    </div>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
