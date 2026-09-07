import type { Metadata } from 'next';
import { can } from '@relay/rbac';
import { Breadcrumbs, PageHeader, PermissionDenied } from '@relay/ui';
import { listAssignableUsers } from '@/features/projects/queries';
import { requirePrincipalOrRedirect } from '@/server/session';
import { NewProjectForm } from './new-project-form';

export const metadata: Metadata = { title: 'New project' };
export const dynamic = 'force-dynamic';

export default async function NewProjectPage() {
  const principal = await requirePrincipalOrRedirect('/projects/new');
  if (!can(principal, 'project:create')) return <PermissionDenied />;

  const people = await listAssignableUsers(principal.organizationId);

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <Breadcrumbs items={[{ label: 'Projects', href: '/projects' }, { label: 'New project' }]} />
      <PageHeader
        title="New migration project"
        description="One merchant, one project record. Creating it seeds the access, asset and scope checklists so nothing has to be remembered."
      />
      <NewProjectForm
        ahn={people.ahn.map((person) => ({
          id: person.id,
          name: person.name,
          title: person.title,
        }))}
        shopline={people.shopline.map((person) => ({
          id: person.id,
          name: person.name,
          title: person.title,
        }))}
        canManageMoney={can(principal, 'invoice:manage')}
      />
    </div>
  );
}
