import type { Metadata } from 'next';
import Link from 'next/link';
import { ExternalLink, TriangleAlert } from 'lucide-react';
import { ACCESS_STATUS_LABEL, formatDate } from '@relay/core';
import { Alert, Badge, Card, CardHeader, Empty, ProgressBar } from '@relay/ui';
import {
  AccessStatusPicker,
  AttachLinkButton,
  FileUploadButton,
} from '@/app/(app)/projects/[code]/access/access-controls';
import { accessWaitingOnMerchant, plainAccessItem } from '@/features/portal/merchant-copy';
import { findPortalProject } from '@/features/portal/queries';
import { requirePrincipalOrRedirect } from '@/server/session';
import { CopyEmail, StuckButton } from '../merchant-help';
import { NoPortalProject } from '../no-project';

export const metadata: Metadata = { title: 'Access' };
export const dynamic = 'force-dynamic';

/**
 * Official step-by-step guides for adding a staff member, by current
 * platform. Only platforms whose guide address we are sure of are listed;
 * anything else gets "ask your project manager" instead of a guessed link.
 */
function staffGuideFor(platform: string | null): { name: string; url: string } | null {
  if (platform && /shopify/i.test(platform)) {
    return { name: 'Shopify', url: 'https://help.shopify.com/en/manual/your-account/users' };
  }
  return null;
}

/**
 * The merchant's side of the access checklist, in plain words. They can say
 * they have given access, or that something is wrong; only AHN can confirm
 * it works, which is why VERIFIED is not one of the options here.
 */
export default async function PortalAccessPage() {
  const principal = await requirePrincipalOrRedirect('/portal/access');
  const project = await findPortalProject(principal);
  if (!project) return <NoPortalProject />;

  const items = project.accessItems;
  const verified = items.filter((item) => item.status === 'VERIFIED').length;
  const waiting = items.filter(accessWaitingOnMerchant);
  const waitingToStart = waiting.filter((item) => item.blocking && item.kind !== 'DOMAIN_DNS');
  const pm = project.people.ahnPm;
  const notify = [pm?.id, project.people.shoplineAm?.id].filter((id): id is string => !!id);
  const guide = staffGuideFor(project.merchantDetail.currentPlatform);
  const onlyWebAddressLeft =
    waiting.length > 0 && waiting.every((item) => item.kind === 'DOMAIN_DNS');

  return (
    <div className="space-y-4">
      {onlyWebAddressLeft ? (
        <Alert tone="info" title="The last step before launch: your web address settings">
          {project.targetLaunchDate
            ? `We will need this when it is time to turn your new store live on ${formatDate(project.targetLaunchDate)}. Nothing else is waiting on you here.`
            : 'We will need this when it is time to turn your new store live. Nothing else is waiting on you here.'}
        </Alert>
      ) : waitingToStart.length > 0 ? (
        <Alert tone="warning" title="We need these to keep your move going">
          {waitingToStart.map((item) => plainAccessItem(item).title).join(', ')}. The rest can
          follow.
        </Alert>
      ) : waiting.length > 0 ? (
        <Alert
          tone="info"
          title={
            waiting.length === 1
              ? `One login is still needed: ${plainAccessItem(waiting[0]!).title}`
              : `${waiting.length} logins are still needed`
          }
        >
          {waiting.length > 1 &&
            `${waiting.map((item) => plainAccessItem(item).title).join(', ')}. `}
          None of them hold up the work right now, but we will need them before launch.
        </Alert>
      ) : items.length > 0 ? (
        <Alert tone="success" title="Nothing is waiting on you here">
          Thank you - we have every login we need for now.
        </Alert>
      ) : null}

      <Card>
        <CardHeader
          title="Logins we need from you"
          description="Once you have given us access, mark it as done. We check that it works and confirm."
          actions={
            <div className="w-32">
              <ProgressBar
                value={items.length === 0 ? 0 : (verified / items.length) * 100}
                size="sm"
                tone={verified === items.length ? 'success' : 'accent'}
                label="Access confirmed"
              />
            </div>
          }
        />

        {items.length === 0 ? (
          <Empty title="Nothing requested yet" className="py-10" />
        ) : (
          <ul className="divide-line divide-y">
            {items.map((item) => {
              const plain = plainAccessItem(item);
              const done = item.status === 'VERIFIED';
              return (
                <li key={item.id} className="px-5 py-4">
                  <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2">
                    <div className="min-w-[16rem] flex-1">
                      <p className="text-ink flex items-center gap-2 text-[13.5px] font-medium leading-5">
                        {plain.title}
                        {item.blocking && !done && item.kind !== 'DOMAIN_DNS' && (
                          <Badge tone="danger" size="sm" variant="outline">
                            needed to start
                          </Badge>
                        )}
                      </p>
                      {plain.help && (
                        <p className="text-muted mt-0.5 max-w-[65ch] text-[12.5px] leading-5">
                          {plain.help}
                        </p>
                      )}

                      {item.status === 'ISSUE' && (
                        <p className="border-danger/30 bg-danger-soft/50 text-danger-ink mt-2 flex max-w-[65ch] items-start gap-2 rounded-[var(--radius-sm)] border px-3 py-2 text-[12.5px] leading-5">
                          <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
                          <span>
                            Something is not working with this one yet. Your project manager will
                            say what to change in{' '}
                            <Link href="/portal/activity" className="underline underline-offset-2">
                              Conversation
                            </Link>
                            .
                          </span>
                        </p>
                      )}

                      {plain.inviteUs && !done && pm?.email && (
                        <div className="bg-surface-2 mt-2 max-w-[65ch] rounded-[var(--radius-sm)] px-3 py-2 text-[12.5px] leading-5">
                          <p className="text-ink-soft">
                            Rather not share a password? Add us as a staff member instead:
                          </p>
                          <p className="mt-1">
                            <CopyEmail email={pm.email} />
                          </p>
                          {item.kind === 'SOURCE_PLATFORM' && guide && (
                            <a
                              href={guide.url}
                              target="_blank"
                              rel="noreferrer noopener"
                              className="text-accent-ink mt-1 inline-flex items-center gap-1 underline-offset-4 hover:underline"
                            >
                              How to add a staff member on {guide.name}
                              <ExternalLink className="size-3" />
                            </a>
                          )}
                        </div>
                      )}

                      {item.verifiedAt && (
                        <p className="text-success-ink mt-1 text-[11.5px]">
                          Confirmed working on {formatDate(item.verifiedAt)}
                        </p>
                      )}
                    </div>

                    <div className="flex shrink-0 flex-col items-end gap-1.5">
                      {done ? (
                        <Badge tone={ACCESS_STATUS_LABEL.VERIFIED.tone} size="sm">
                          {ACCESS_STATUS_LABEL.VERIFIED.label}
                        </Badge>
                      ) : (
                        <AccessStatusPicker
                          code={project.code}
                          itemId={item.id}
                          status={item.status}
                          options={['REQUESTED', 'RECEIVED', 'ISSUE']}
                          labels={{
                            REQUESTED: 'Not yet',
                            RECEIVED: "I've given access",
                            ISSUE: 'Something is wrong',
                          }}
                        />
                      )}
                      {!done && (
                        <div className="flex flex-wrap justify-end gap-1">
                          <AttachLinkButton
                            code={project.code}
                            accessItemId={item.id}
                            label={plain.title}
                          />
                          <FileUploadButton code={project.code} accessItemId={item.id} />
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
