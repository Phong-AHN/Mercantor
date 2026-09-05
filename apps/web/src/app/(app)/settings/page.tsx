import type { Metadata } from 'next';
import {
  AGING_BAND_LABEL,
  DEFAULT_ACCESS_CHECKLIST,
  DEFAULT_ASSET_CHECKLIST,
  LINEAR_STAGES,
  STAGES,
  TEAM_LABEL,
} from '@relay/core';
import { can } from '@relay/rbac';
import {
  Alert,
  Badge,
  Card,
  CardBody,
  CardHeader,
  PageHeader,
  PermissionDenied,
  StatusPill,
  Table,
  TableScroller,
  TBody,
  TD,
  TH,
  THead,
  TR,
} from '@relay/ui';
import { getPortalSettings } from '@/features/settings/service';
import { requirePrincipalOrRedirect } from '@/server/session';
import { AgingForm } from './aging-form';

export const metadata: Metadata = { title: 'Settings' };
export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const principal = await requirePrincipalOrRedirect('/settings');
  if (!can(principal, 'settings:manage')) return <PermissionDenied />;

  const settings = await getPortalSettings();

  return (
    <div className="space-y-5">
      <PageHeader
        title="Settings"
        description="Portal-wide configuration. These numbers decide what the dashboard calls delayed and what the nightly sweep chases."
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <AgingForm
          attentionDays={settings.aging.attentionDays}
          delayedDays={settings.aging.delayedDays}
          criticalDays={settings.aging.criticalDays}
          inactivityDays={settings.inactivityDays}
        />

        <Card>
          <CardHeader
            title="Stage targets"
            description="How long each stage is expected to take, and who the clock runs against while a project sits there."
          />
          <TableScroller className="rounded-none border-0 shadow-none">
            <Table>
              <THead>
                <tr>
                  <TH className="min-w-[13rem]">Stage</TH>
                  <TH>Waiting on</TH>
                  <TH numeric>Target</TH>
                </tr>
              </THead>
              <TBody>
                {LINEAR_STAGES.map((stage) => (
                  <TR key={stage}>
                    <TD>
                      <span className="text-ink text-[13px]">{STAGES[stage].label}</span>
                      <span className="text-faint mt-0.5 block text-[11px]">
                        {STAGES[stage].description}
                      </span>
                    </TD>
                    <TD>
                      <Badge tone="neutral" size="sm">
                        {TEAM_LABEL[STAGES[stage].ownerTeam].label}
                      </Badge>
                    </TD>
                    <TD numeric className="text-muted text-[12.5px]">
                      {STAGES[stage].targetDays === null ? '-' : `${STAGES[stage].targetDays}d`}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </TableScroller>
          <CardBody className="border-line border-t">
            <Alert tone="info" dense>
              Stage targets are defined in code, in the domain package, so every screen and the
              worker agree on them. They are shown here for reference.
            </Alert>
          </CardBody>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="Default access checklist"
            count={DEFAULT_ACCESS_CHECKLIST.length}
            description="Seeded onto every new project. Blocking items stop migration until they are verified."
          />
          <CardBody>
            <ul className="space-y-2">
              {DEFAULT_ACCESS_CHECKLIST.map((item) => (
                <li key={item.label} className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-ink text-[12.5px] font-medium">{item.label}</p>
                    <p className="text-muted text-[11.5px]">{item.hint}</p>
                  </div>
                  {item.blocking && (
                    <Badge tone="danger" size="sm" variant="outline">
                      blocking
                    </Badge>
                  )}
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Default asset checklist"
            count={DEFAULT_ASSET_CHECKLIST.length}
            description="The standard merchant onboarding list."
          />
          <CardBody>
            <ul className="space-y-2">
              {DEFAULT_ASSET_CHECKLIST.map((item) => (
                <li key={item.label} className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-ink text-[12.5px] font-medium">{item.label}</p>
                    <p className="text-muted text-[11.5px]">{item.hint}</p>
                  </div>
                  <Badge tone={item.required ? 'warning' : 'muted'} size="sm" variant="outline">
                    {item.required ? 'required' : 'optional'}
                  </Badge>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader
          title="Ageing bands in use"
          description="What each band means with the current thresholds."
        />
        <CardBody>
          <div className="grid gap-3 sm:grid-cols-4">
            {(
              [
                ['ON_TRACK', `0-${settings.aging.attentionDays - 1} days`],
                [
                  'ATTENTION',
                  `${settings.aging.attentionDays}-${settings.aging.delayedDays - 1} days`,
                ],
                [
                  'DELAYED',
                  `${settings.aging.delayedDays}-${settings.aging.criticalDays - 1} days`,
                ],
                ['CRITICAL', `${settings.aging.criticalDays}+ days`],
              ] as const
            ).map(([band, range]) => (
              <div key={band} className="border-line rounded-[var(--radius-md)] border p-3">
                <StatusPill descriptor={AGING_BAND_LABEL[band]} size="sm" />
                <p className="tabular text-ink mt-2 text-[13px] font-medium">{range}</p>
              </div>
            ))}
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
