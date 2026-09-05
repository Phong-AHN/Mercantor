import type { Metadata } from 'next';
import Link from 'next/link';
import { ExternalLink, Mail, Phone } from 'lucide-react';
import { formatDate } from '@relay/core';
import { can } from '@relay/rbac';
import {
  Avatar,
  Badge,
  Card,
  CardBody,
  CardHeader,
  Empty,
  Mono,
  PageHeader,
  PermissionDenied,
} from '@relay/ui';
import { HealthPill, StagePill } from '@/components/domain';
import { listMerchants } from '@/features/workspace/queries';
import { requirePrincipalOrRedirect } from '@/server/session';

export const metadata: Metadata = { title: 'Merchants' };
export const dynamic = 'force-dynamic';

/**
 * The contact database the brief asks for. One card per merchant, with the
 * contacts and the projects attached - so the introduction email never has to
 * go looking for an address.
 */
export default async function MerchantsPage() {
  const principal = await requirePrincipalOrRedirect('/merchants');
  if (!can(principal, 'merchant:read')) return <PermissionDenied />;

  const merchants = await listMerchants(principal);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Merchants"
        description="Every SHOPLINE merchant AHN is migrating, with the contacts and stores attached to them."
      />

      {merchants.length === 0 ? (
        <Card>
          <Empty title="No merchants yet" className="py-14" />
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {merchants.map((merchant) => (
            <Card key={merchant.id}>
              <CardHeader
                icon={<Avatar name={merchant.name} team="MERCHANT" size="sm" />}
                title={merchant.name}
                description={
                  [merchant.industry, merchant.country].filter(Boolean).join(' - ') || undefined
                }
                actions={
                  merchant.shoplineStoreId ? <Mono>{merchant.shoplineStoreId}</Mono> : undefined
                }
              />
              <CardBody className="space-y-4">
                <div className="flex flex-wrap items-center gap-3 text-[12.5px]">
                  {merchant.website && (
                    <a
                      href={merchant.website}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="text-accent-ink inline-flex items-center gap-1 underline-offset-4 hover:underline"
                    >
                      {merchant.website.replace(/^https?:\/\//, '')}
                      <ExternalLink className="size-3" />
                    </a>
                  )}
                  {merchant.currentPlatform && (
                    <Badge tone="muted" size="sm">
                      from {merchant.currentPlatform}
                    </Badge>
                  )}
                </div>

                <div>
                  <p className="text-faint mb-1.5 text-[11px] font-semibold uppercase tracking-wide">
                    Contacts
                  </p>
                  {merchant.contacts.length === 0 ? (
                    <p className="text-faint text-[12.5px]">
                      No contact recorded - the introduction email cannot be sent without one.
                    </p>
                  ) : (
                    <ul className="space-y-2">
                      {merchant.contacts.map((contact) => (
                        <li key={contact.id} className="flex flex-wrap items-baseline gap-x-3">
                          <span className="text-ink text-[13px] font-medium">
                            {contact.name}
                            {contact.isPrimary && (
                              <Badge tone="warning" size="sm" className="ml-1.5 align-middle">
                                primary
                              </Badge>
                            )}
                          </span>
                          {contact.title && (
                            <span className="text-faint text-[11.5px]">{contact.title}</span>
                          )}
                          <a
                            href={`mailto:${contact.email}`}
                            className="text-muted hover:text-accent-ink inline-flex items-center gap-1 text-[12px]"
                          >
                            <Mail className="size-3" />
                            {contact.email}
                          </a>
                          {contact.phone && (
                            <span className="text-muted inline-flex items-center gap-1 text-[12px]">
                              <Phone className="size-3" />
                              {contact.phone}
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div>
                  <p className="text-faint mb-1.5 text-[11px] font-semibold uppercase tracking-wide">
                    Projects
                  </p>
                  <ul className="space-y-1.5">
                    {merchant.projects.map((project) => (
                      <li key={project.id}>
                        <Link
                          href={`/projects/${project.code}`}
                          className="hover:bg-surface-2 flex items-center justify-between gap-3 rounded-[var(--radius-sm)] px-2 py-1.5 transition-colors"
                        >
                          <span className="flex items-center gap-2">
                            <Mono>{project.code}</Mono>
                            <StagePill stage={project.stage} size="sm" />
                            <HealthPill health={project.health} size="sm" />
                          </span>
                          <span className="text-faint text-[11.5px]">
                            {project.targetLaunchDate
                              ? `launch ${formatDate(project.targetLaunchDate)}`
                              : 'no launch date'}
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              </CardBody>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
