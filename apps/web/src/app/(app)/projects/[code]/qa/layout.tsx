import { can } from '@relay/rbac';
import { PermissionDenied } from '@relay/ui';
import { QaNav } from '@/components/qa/profile-controls';
import { getSiteQa } from '@/features/qa/queries';
import { requirePrincipalOrRedirect } from '@/server/session';

export default async function SiteQaLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const principal = await requirePrincipalOrRedirect(`/projects/${code}/qa`);
  if (!can(principal, 'qa:read')) return <PermissionDenied />;
  const qa = await getSiteQa(principal, code);

  return (
    <div className="space-y-4">
      <QaNav base={`/projects/${code}/qa`} counts={{ findings: qa.open.length }} />
      {children}
    </div>
  );
}
