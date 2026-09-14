import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft, Users, UserPlus } from 'lucide-react';
import { clock } from '@relay/core';
import { can } from '@relay/rbac';
import { Card, CardBody, CardHeader, PageHeader, PermissionDenied } from '@relay/ui';
import {
  listAllAccountsForPlatform,
  listOrganizationsForInvite,
  listProjectsForMerchantInvite,
} from '@/features/platform/service';
import { requirePrincipalOrRedirect } from '@/server/session';
import { AccountsTable } from './accounts-table';
import { PlatformInviteForm } from './invite-form';

export const metadata: Metadata = { title: 'Manage accounts' };
export const dynamic = 'force-dynamic';

/**
 * The account-management gap `/people` deliberately leaves open: that
 * page's invite button is scoped to the inviter's own organization,
 * refuses to grant `PLATFORM_ADMIN` or `MERCHANT`, and there is no edit
 * capability there at all (see `inviteUserAction`'s comment). PLATFORM_ADMIN
 * has no organization of its own to fall back to there, so this is its own
 * screen: create any account, and manage every account already on the
 * portal - role, organization, active/deactivated, and a fresh
 * invite/reset link - regardless of which organization it belongs to.
 */
export default async function PlatformPeoplePage() {
  const principal = await requirePrincipalOrRedirect('/admin/platform/people');
  if (!can(principal, 'platform:manage')) return <PermissionDenied />;

  const [organizations, projects, accounts] = await Promise.all([
    listOrganizationsForInvite(),
    listProjectsForMerchantInvite(),
    listAllAccountsForPlatform(),
  ]);
  const now = clock.now();

  return (
    <div className="space-y-5">
      <PageHeader
        title="Manage accounts"
        description="Every account on the portal, across every organization - create, edit, deactivate, or send a fresh sign-in link."
        actions={
          <Link
            href="/admin/platform"
            className="text-muted hover:text-ink flex items-center gap-1.5 text-[12.5px]"
          >
            <ArrowLeft className="size-3.5" />
            Platform config
          </Link>
        }
      />

      <Card>
        <CardHeader
          icon={<UserPlus className="size-4" />}
          title="Invite"
          description="Creates the account and emails a link to set their own password - nothing is usable until that link is opened."
        />
        <CardBody>
          <PlatformInviteForm organizations={organizations} projects={projects} />
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          icon={<Users className="size-4" />}
          title="All accounts"
          count={accounts.length}
          description="Merchant accounts show here too, but their access comes from the project they were invited to, not a role - edit that from the project's own Settings tab instead."
        />
        <AccountsTable
          accounts={accounts}
          organizations={organizations}
          currentUserId={principal.id}
          now={now}
        />
      </Card>
    </div>
  );
}
