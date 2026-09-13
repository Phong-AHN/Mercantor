import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft, UserPlus } from 'lucide-react';
import { can } from '@relay/rbac';
import { Card, CardBody, CardHeader, PageHeader, PermissionDenied } from '@relay/ui';
import { listOrganizationsForInvite, listProjectsForMerchantInvite } from '@/features/platform/service';
import { requirePrincipalOrRedirect } from '@/server/session';
import { PlatformInviteForm } from './invite-form';

export const metadata: Metadata = { title: 'Create account' };
export const dynamic = 'force-dynamic';

/**
 * The account-creation gap `/people` deliberately leaves open: that page's
 * invite button is scoped to the inviter's own organization and refuses to
 * grant `PLATFORM_ADMIN` or `MERCHANT` (see `inviteUserAction`'s comment).
 * PLATFORM_ADMIN has no organization of its own to fall back to there, so
 * this is its own screen - any role, any organization, or a merchant on any
 * project.
 */
export default async function PlatformPeoplePage() {
  const principal = await requirePrincipalOrRedirect('/admin/platform/people');
  if (!can(principal, 'platform:manage')) return <PermissionDenied />;

  const [organizations, projects] = await Promise.all([
    listOrganizationsForInvite(),
    listProjectsForMerchantInvite(),
  ]);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Create account"
        description="Any role, any organization, or a merchant on any project - the wider reach /people intentionally does not offer."
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
    </div>
  );
}
