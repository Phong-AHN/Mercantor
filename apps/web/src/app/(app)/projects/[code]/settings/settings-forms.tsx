'use client';

import { useState } from 'react';
import { Save, UserPlus } from 'lucide-react';
import { MIGRATION_TYPE_LABEL, MIGRATION_TYPES, type MigrationType } from '@relay/core';
import {
  Alert,
  Avatar,
  Button,
  Card,
  CardBody,
  CardHeader,
  Empty,
  Field,
  FormActions,
  Input,
  Select,
  Textarea,
} from '@relay/ui';
import { useAction } from '@/components/use-action';
import {
  assignPeopleAction,
  inviteMerchantAction,
  updateProjectAction,
} from '@/features/projects/actions';

interface Person {
  id: string;
  name: string;
  title?: string | null;
}

export function ProjectDetailsForm({
  code,
  migrationType,
  targetLaunchDate,
  scopeSummary,
  deploymentNotes,
  contractTotal,
}: {
  code: string;
  migrationType: MigrationType;
  targetLaunchDate: string | null;
  scopeSummary: string | null;
  deploymentNotes: string | null;
  contractTotal: number | null;
}) {
  const [form, setForm] = useState({
    migrationType,
    targetLaunchDate: targetLaunchDate?.slice(0, 10) ?? '',
    scopeSummary: scopeSummary ?? '',
    deploymentNotes: deploymentNotes ?? '',
    contractTotal: contractTotal?.toString() ?? '',
  });
  const action = useAction(updateProjectAction);

  return (
    <Card>
      <CardHeader
        title="Project details"
        description="The target launch date drives the ahead/behind figures everywhere else."
      />
      <CardBody className="space-y-4">
        {action.error && (
          <Alert tone="danger" dense>
            {action.error}
          </Alert>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Migration type" htmlFor="migrationType">
            <Select
              id="migrationType"
              value={form.migrationType}
              onChange={(event) =>
                setForm({ ...form, migrationType: event.target.value as MigrationType })
              }
            >
              {MIGRATION_TYPES.map((value) => (
                <option key={value} value={value}>
                  {MIGRATION_TYPE_LABEL[value].label}
                </option>
              ))}
            </Select>
          </Field>
          <Field
            label="Target launch date"
            htmlFor="targetLaunchDate"
            error={action.fieldErrors.targetLaunchDate ?? null}
          >
            <Input
              id="targetLaunchDate"
              type="date"
              value={form.targetLaunchDate}
              onChange={(event) => setForm({ ...form, targetLaunchDate: event.target.value })}
            />
          </Field>
        </div>

        {contractTotal !== null && (
          <Field
            label="Contract value"
            htmlFor="contractTotal"
            hint="Total agreed, including any change requests."
          >
            <Input
              id="contractTotal"
              type="number"
              min={0}
              step="0.01"
              value={form.contractTotal}
              onChange={(event) => setForm({ ...form, contractTotal: event.target.value })}
            />
          </Field>
        )}

        <Field
          label="Scope summary"
          htmlFor="scopeSummary"
          hint="One paragraph anyone can read to know what was agreed."
        >
          <Textarea
            id="scopeSummary"
            value={form.scopeSummary}
            onChange={(event) => setForm({ ...form, scopeSummary: event.target.value })}
            rows={3}
          />
        </Field>

        <Field label="Deployment notes" htmlFor="deploymentNotes">
          <Textarea
            id="deploymentNotes"
            value={form.deploymentNotes}
            onChange={(event) => setForm({ ...form, deploymentNotes: event.target.value })}
            rows={3}
          />
        </Field>

        <FormActions>
          <Button
            variant="primary"
            size="sm"
            loading={action.pending}
            onClick={() =>
              action.run({
                code,
                migrationType: form.migrationType,
                targetLaunchDate: form.targetLaunchDate || undefined,
                scopeSummary: form.scopeSummary || undefined,
                deploymentNotes: form.deploymentNotes || undefined,
                contractTotalMinor:
                  form.contractTotal === ''
                    ? undefined
                    : Math.round(Number(form.contractTotal) * 100),
              })
            }
          >
            <Save className="size-3.5" />
            Save details
          </Button>
        </FormActions>
      </CardBody>
    </Card>
  );
}

export function AssignmentForm({
  code,
  ahn,
  shopline,
  current,
}: {
  code: string;
  ahn: Person[];
  shopline: Person[];
  current: {
    ahnProjectManagerId: string | null;
    ahnDeveloperId: string | null;
    shoplineAmId: string | null;
    shoplineSeId: string | null;
  };
}) {
  const [form, setForm] = useState({
    ahnProjectManagerId: current.ahnProjectManagerId ?? '',
    ahnDeveloperId: current.ahnDeveloperId ?? '',
    shoplineAmId: current.shoplineAmId ?? '',
    shoplineSeId: current.shoplineSeId ?? '',
  });
  const action = useAction(assignPeopleAction);

  const field = (label: string, key: keyof typeof form, options: Person[], hint: string) => (
    <Field label={label} htmlFor={key} hint={hint}>
      <Select
        id={key}
        value={form[key]}
        onChange={(event) => setForm({ ...form, [key]: event.target.value })}
      >
        <option value="">Nobody assigned</option>
        {options.map((person) => (
          <option key={person.id} value={person.id}>
            {person.name}
            {person.title ? ` - ${person.title}` : ''}
          </option>
        ))}
      </Select>
    </Field>
  );

  return (
    <Card>
      <CardHeader
        title="Who is responsible"
        description="These four names are who gets notified when something needs a decision."
      />
      <CardBody className="space-y-4">
        {action.error && (
          <Alert tone="danger" dense>
            {action.error}
          </Alert>
        )}

        {field(
          'AHN project manager',
          'ahnProjectManagerId',
          ahn,
          'Owns delivery, and is the merchant"s main point of contact at AHN.',
        )}
        {field('AHN developer', 'ahnDeveloperId', ahn, 'Does the migration and the build.')}
        {field(
          'SHOPLINE account manager',
          'shoplineAmId',
          shopline,
          'Owns the merchant relationship and the introduction.',
        )}
        {field(
          'SHOPLINE solutions engineer',
          'shoplineSeId',
          shopline,
          'Answers the technical questions AHN cannot answer alone.',
        )}

        <FormActions>
          <Button
            variant="primary"
            size="sm"
            loading={action.pending}
            onClick={() =>
              action.run({
                code,
                ahnProjectManagerId: form.ahnProjectManagerId || null,
                ahnDeveloperId: form.ahnDeveloperId || null,
                shoplineAmId: form.shoplineAmId || null,
                shoplineSeId: form.shoplineSeId || null,
              })
            }
          >
            <Save className="size-3.5" />
            Save assignments
          </Button>
        </FormActions>
      </CardBody>
    </Card>
  );
}

interface MerchantMember {
  id: string;
  name: string;
  email: string;
}

/**
 * The other gap `FUTURE-WORK.md` §1 named: a merchant's portal access is a
 * real `ProjectMember` row (D-010), but nothing ever created one outside
 * `pnpm db:seed`. Inviting someone already listed here is harmless -
 * `inviteMerchantAction` treats a repeat invite as "grant access, do not
 * re-send a password email" once their account already exists.
 */
export function MerchantAccessForm({ code, members }: { code: string; members: MerchantMember[] }) {
  const [form, setForm] = useState({ name: '', email: '' });
  const action = useAction(inviteMerchantAction, {
    onSuccess: () => setForm({ name: '', email: '' }),
  });

  return (
    <Card>
      <CardHeader
        title="Merchant portal access"
        count={members.length}
        description="Who can sign in to this project's merchant portal."
      />
      <CardBody className="space-y-4">
        {members.length === 0 ? (
          <Empty title="Nobody invited yet" className="py-6" />
        ) : (
          <ul className="space-y-2">
            {members.map((member) => (
              <li key={member.id} className="flex items-center gap-2.5">
                <Avatar name={member.name} team="MERCHANT" size="sm" />
                <div className="min-w-0">
                  <p className="text-ink truncate text-[13px] font-medium">{member.name}</p>
                  <p className="text-faint truncate text-[11.5px]">{member.email}</p>
                </div>
              </li>
            ))}
          </ul>
        )}

        <div className="border-line space-y-3 border-t pt-4">
          {action.error && (
            <Alert tone="danger" dense>
              {action.error}
            </Alert>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Name" htmlFor="merchant-name" error={action.fieldErrors.name ?? null}>
              <Input
                id="merchant-name"
                value={form.name}
                onChange={(event) => setForm({ ...form, name: event.target.value })}
                placeholder="Merchant contact's name"
              />
            </Field>
            <Field label="Email" htmlFor="merchant-email" error={action.fieldErrors.email ?? null}>
              <Input
                id="merchant-email"
                type="email"
                value={form.email}
                onChange={(event) => setForm({ ...form, email: event.target.value })}
                placeholder="owner@merchant.example"
              />
            </Field>
          </div>

          <FormActions>
            <Button
              variant="secondary"
              size="sm"
              loading={action.pending}
              onClick={() => action.run({ code, name: form.name, email: form.email })}
            >
              <UserPlus className="size-3.5" />
              Invite to portal
            </Button>
          </FormActions>
        </div>
      </CardBody>
    </Card>
  );
}
