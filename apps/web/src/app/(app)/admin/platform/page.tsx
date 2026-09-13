import type { Metadata } from 'next';
import Link from 'next/link';
import { Mail, MessageSquare, ShieldCheck, SquareKanban, UserPlus } from 'lucide-react';
import { formatDateTime } from '@relay/core';
import { platformIntegrationStatus, type PlatformIntegrationStatus } from '@relay/integrations';
import type { IntegrationProvider } from '@relay/db';
import { can } from '@relay/rbac';
import {
  Alert,
  Badge,
  buttonStyles,
  Card,
  CardBody,
  CardHeader,
  PageHeader,
  PermissionDenied,
} from '@relay/ui';
import { getRoleMatrix } from '@/features/platform/service';
import { requirePrincipalOrRedirect } from '@/server/session';
import { PermissionMatrix, ResetHint } from './permission-matrix';
import { PlatformClickUpForm, PlatformEmailForm, PlatformSlackForm } from './platform-credentials-panel';

export const metadata: Metadata = { title: 'Platform config' };
export const dynamic = 'force-dynamic';

/**
 * The one screen for what used to only live in `.env` or in code:
 * the shared fallback Slack/ClickUp/email credentials every organization
 * without its own account quietly falls to (`registry.ts`), and the role
 * permission matrix (`ROLE_PERMISSIONS`) itself. `platform:manage` is held
 * by PLATFORM_ADMIN alone - see that permission's own comment in
 * `permissions.ts` for why it is kept separate from `settings:manage`.
 */
export default async function PlatformAdminPage() {
  const principal = await requirePrincipalOrRedirect('/admin/platform');
  if (!can(principal, 'platform:manage')) return <PermissionDenied />;

  const [integrations, matrix] = await Promise.all([platformIntegrationStatus(), getRoleMatrix()]);
  const byProvider = new Map<IntegrationProvider, PlatformIntegrationStatus>(
    integrations.map((row) => [row.provider, row]),
  );
  const statusFor = (provider: IntegrationProvider): PlatformIntegrationStatus =>
    byProvider.get(provider) ?? { provider, configured: false, updatedAt: null, updatedByName: null };

  const providers = [
    {
      key: 'SLACK' as const,
      name: 'Slack',
      icon: <MessageSquare className="size-4" />,
      status: statusFor('SLACK'),
      form: <PlatformSlackForm configured={statusFor('SLACK').configured} />,
    },
    {
      key: 'CLICKUP' as const,
      name: 'ClickUp',
      icon: <SquareKanban className="size-4" />,
      status: statusFor('CLICKUP'),
      form: <PlatformClickUpForm configured={statusFor('CLICKUP').configured} />,
    },
    {
      key: 'EMAIL' as const,
      name: 'Email',
      icon: <Mail className="size-4" />,
      status: statusFor('EMAIL'),
      form: <PlatformEmailForm configured={statusFor('EMAIL').configured} />,
    },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Platform config"
        description="Portal-wide values and features, not one organization's own settings. Visible and editable only here."
      />

      <Card>
        <CardHeader
          icon={<UserPlus className="size-4" />}
          title="Accounts"
          description="Create a staff account in any organization, another PLATFORM_ADMIN, or a merchant on any project - the reach /people's own invite button does not have."
          actions={
            <Link href="/admin/platform/people" className={buttonStyles('secondary', 'sm')}>
              <UserPlus className="size-3.5" />
              Create account
            </Link>
          }
        />
      </Card>

      <Card>
        <CardHeader
          icon={<ShieldCheck className="size-4" />}
          title="Fallback credentials"
          description="The shared account an organization without its own Slack/ClickUp/Resend connection falls to. Underneath this sits only the process .env - set at deploy time, not editable here."
        />
        <CardBody className="grid gap-4 lg:grid-cols-3">
          {providers.map((provider) => (
            <div key={provider.key} className="border-line rounded-[var(--radius-md)] border p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-ink flex items-center gap-2 text-[13px] font-medium">
                  {provider.icon}
                  {provider.name}
                </span>
                <Badge tone={provider.status.configured ? 'success' : 'muted'} size="sm" dot>
                  {provider.status.configured ? 'set' : 'not set'}
                </Badge>
              </div>
              {provider.status.configured && (
                <p className="text-muted mt-2 text-[11.5px]">
                  {provider.status.updatedByName ? `Set by ${provider.status.updatedByName}` : 'Set'}
                  {provider.status.updatedAt ? ` · ${formatDateTime(provider.status.updatedAt)}` : ''}
                </p>
              )}
              {provider.form}
            </div>
          ))}
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          icon={<ShieldCheck className="size-4" />}
          title="Role permissions"
          description="What ROLE_PERMISSIONS grants by default, with any override applied on top. PLATFORM_ADMIN is not shown - it always holds everything."
        />
        <CardBody className="space-y-3">
          <Alert tone="warning" dense>
            Revoking a permission a role's own screens depend on breaks those screens for everyone
            holding that role, immediately. Change one cell at a time and check the result before
            moving to the next.
          </Alert>
          <ResetHint />
          <PermissionMatrix permissions={matrix.permissions} roles={matrix.roles} cells={matrix.cells} />
        </CardBody>
      </Card>
    </div>
  );
}
