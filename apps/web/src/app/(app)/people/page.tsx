import type { Metadata } from 'next';
import { clock, formatRelative, TEAM_LABEL, USER_ROLE_LABEL, type Descriptor, type Team } from '@relay/core';
import { can, permissionsForRole } from '@relay/rbac';
import {
  Badge,
  Card,
  CardHeader,
  Empty,
  PageHeader,
  PermissionDenied,
  PersonCell,
  Table,
  TableScroller,
  TBody,
  TD,
  TH,
  THead,
  TR,
} from '@relay/ui';
import { listPeople } from '@/features/workspace/queries';
import { requirePrincipalOrRedirect } from '@/server/session';
import { EditRoleButton } from './edit-role-button';
import { InvitePersonButton } from './invite-person-button';
import { RemovePersonButton } from './remove-person-button';

export const metadata: Metadata = { title: 'People' };
export const dynamic = 'force-dynamic';

/**
 * A People-page-only grouping, one step finer than `Team`: AHN Designers get
 * their own card instead of folding into the general AHN one, without
 * `Team` itself gaining a `DESIGN` value - that type also drives blocker
 * routing and comment visibility, where "Design" isn't a real destination.
 * `AHN_DESIGNER`'s stored `team` column is still plain `'AHN'` (matching its
 * RBAC), so this pulls it out by role instead of filtering on `person.team`.
 */
const DESIGN_GROUP = 'DESIGN' as const;
const DESIGN_LABEL: Descriptor = { label: 'Design', tone: 'accent' };
const GROUP_ORDER: (Team | typeof DESIGN_GROUP)[] = [
  'AHN',
  DESIGN_GROUP,
  'SHOPLINE',
  'MERCHANT',
  'OTHER',
];

export default async function PeoplePage() {
  const principal = await requirePrincipalOrRedirect('/people');
  if (!can(principal, 'user:read')) return <PermissionDenied />;

  const people = await listPeople(principal);
  const now = clock.now();
  const canManage = can(principal, 'user:manage');
  const canRemove = can(principal, 'user:remove');
  const canAct = canManage || canRemove;

  return (
    <div className="space-y-5">
      <PageHeader
        title="People"
        description="Who has access to the portal, and what their role lets them do. Roles are read from the database on every request - never from a token."
        actions={can(principal, 'user:manage') ? <InvitePersonButton /> : undefined}
      />

      {GROUP_ORDER.map((group) => {
        const members = people.filter((person) =>
          group === DESIGN_GROUP
            ? person.role === 'AHN_DESIGNER'
            : person.team === group && person.role !== 'AHN_DESIGNER',
        );
        if (members.length === 0) return null;
        const label = group === DESIGN_GROUP ? DESIGN_LABEL.label : TEAM_LABEL[group].label;

        return (
          <Card key={group}>
            <CardHeader title={label} count={members.length} />
            <TableScroller className="rounded-none border-0 shadow-none">
              <Table>
                <THead>
                  <tr>
                    <TH className="min-w-[14rem]">Person</TH>
                    <TH>Role</TH>
                    <TH numeric>Projects</TH>
                    <TH>Last seen</TH>
                    <TH>Status</TH>
                    <TH className="min-w-[16rem]">What they can do</TH>
                    {canAct && <TH>Actions</TH>}
                  </tr>
                </THead>
                <TBody>
                  {members.map((person) => {
                    const projects =
                      person._count.managedProjects +
                      person._count.developedProjects +
                      person._count.designedProjects +
                      person._count.accountManagedProject +
                      person._count.engineeredProjects;
                    const permissions = permissionsForRole(person.role);
                    const highlights = permissions
                      .filter((permission) =>
                        [
                          'project:advance_stage',
                          'blocker:manage',
                          'invoice:manage',
                          'handoff:submit',
                          'handoff:decide',
                          'approval:decide_shopline',
                          'comment:internal',
                          'settings:manage',
                        ].includes(permission),
                      )
                      .slice(0, 4);

                    return (
                      <TR key={person.id}>
                        <TD>
                          <PersonCell name={person.name} role={person.email} team={person.team} />
                        </TD>
                        <TD>
                          <Badge tone={USER_ROLE_LABEL[person.role].tone} size="sm">
                            {USER_ROLE_LABEL[person.role].label}
                          </Badge>
                          {person.title && (
                            <span className="text-faint mt-0.5 block text-[11px]">
                              {person.title}
                            </span>
                          )}
                        </TD>
                        <TD numeric className="text-ink text-[13px]">
                          {projects || <span className="text-faint">-</span>}
                        </TD>
                        <TD className="text-muted text-[12.5px]">
                          {person.lastLoginAt ? formatRelative(person.lastLoginAt, now) : 'never'}
                        </TD>
                        <TD>
                          <Badge tone={person.isActive ? 'success' : 'muted'} size="sm" dot>
                            {person.isActive ? 'active' : 'disabled'}
                          </Badge>
                        </TD>
                        <TD>
                          <div className="flex flex-wrap gap-1">
                            {highlights.length === 0 ? (
                              <span className="text-faint text-[11.5px]">
                                Read-only on their own projects
                              </span>
                            ) : (
                              highlights.map((permission) => (
                                <span
                                  key={permission}
                                  className="bg-surface-2 text-muted rounded-full px-2 py-0.5 font-mono text-[10.5px]"
                                >
                                  {permission}
                                </span>
                              ))
                            )}
                          </div>
                        </TD>
                        {canAct && (
                          <TD>
                            {person.team !== 'MERCHANT' && person.id !== principal.id && (
                              <div className="flex items-center gap-1">
                                {canManage && (
                                  <EditRoleButton
                                    userId={person.id}
                                    name={person.name}
                                    role={person.role}
                                    title={person.title}
                                  />
                                )}
                                {canRemove && (
                                  <RemovePersonButton userId={person.id} name={person.name} />
                                )}
                              </div>
                            )}
                          </TD>
                        )}
                      </TR>
                    );
                  })}
                </TBody>
              </Table>
            </TableScroller>
          </Card>
        );
      })}

      {people.length === 0 && (
        <Card>
          <Empty title="No users" className="py-14" />
        </Card>
      )}
    </div>
  );
}
