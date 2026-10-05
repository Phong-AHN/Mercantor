'use client';

import { useState } from 'react';
import { Save, UserPlus } from 'lucide-react';
import {
  MIGRATION_TYPE_LABEL,
  MIGRATION_TYPES,
  USER_ROLE_LABEL,
  type MigrationType,
  type UserRole,
} from '@relay/core';
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
  updateMerchantAction,
  updateProjectAction,
} from '@/features/projects/actions';

interface Person {
  id: string;
  name: string;
  role: UserRole;
  title?: string | null;
}

/** "Role - Name", so a picker with several people sharing a name still
 * reads unambiguously. */
function personOptionLabel(person: Person): string {
  return `${USER_ROLE_LABEL[person.role].label} - ${person.name}`;
}

export interface MerchantDetails {
  name: string;
  website: string | null;
  shoplineStoreId: string | null;
  currentPlatform: string | null;
  country: string | null;
  industry: string | null;
  notes: string | null;
  contact: { name: string; email: string; phone: string | null; title: string | null } | null;
}

/**
 * What was typed once on "New project" - the merchant's name (the title of
 * every project page), store, and who to talk to. Empty optional fields are
 * saved as cleared.
 */
export function MerchantDetailsForm({
  code,
  merchant,
  sharedWithOtherProjects,
}: {
  code: string;
  merchant: MerchantDetails;
  sharedWithOtherProjects: boolean;
}) {
  const [form, setForm] = useState({
    name: merchant.name,
    website: merchant.website ?? '',
    shoplineStoreId: merchant.shoplineStoreId ?? '',
    currentPlatform: merchant.currentPlatform ?? '',
    country: merchant.country ?? '',
    industry: merchant.industry ?? '',
    notes: merchant.notes ?? '',
    contactName: merchant.contact?.name ?? '',
    contactEmail: merchant.contact?.email ?? '',
    contactPhone: merchant.contact?.phone ?? '',
    contactTitle: merchant.contact?.title ?? '',
  });
  const set = (key: keyof typeof form) => (value: string) => setForm({ ...form, [key]: value });
  const action = useAction(updateMerchantAction);
  const error = (key: string) => action.fieldErrors[key] ?? null;

  return (
    <Card className="lg:col-span-2">
      <CardHeader
        title="Merchant details"
        description={
          sharedWithOtherProjects
            ? 'The name and details every page shows for this merchant. This merchant has other projects too - they change everywhere.'
            : 'The name and details every page shows for this merchant.'
        }
      />
      <CardBody className="space-y-4">
        {action.error && Object.keys(action.fieldErrors).length === 0 && (
          <Alert tone="danger" dense>
            {action.error}
          </Alert>
        )}

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Merchant name" htmlFor="merchantName" required error={error('name')}>
            <Input
              id="merchantName"
              value={form.name}
              onChange={(event) => set('name')(event.target.value)}
            />
          </Field>
          <Field label="Website" htmlFor="merchantWebsite" error={error('website')}>
            <Input
              id="merchantWebsite"
              type="url"
              placeholder="https://"
              value={form.website}
              onChange={(event) => set('website')(event.target.value)}
            />
          </Field>
          <Field
            label="SHOPLINE store ID"
            htmlFor="shoplineStoreId"
            error={error('shoplineStoreId')}
          >
            <Input
              id="shoplineStoreId"
              value={form.shoplineStoreId}
              onChange={(event) => set('shoplineStoreId')(event.target.value)}
            />
          </Field>
          <Field label="Moving from" htmlFor="currentPlatform" error={error('currentPlatform')}>
            <Input
              id="currentPlatform"
              placeholder="Shopify, WooCommerce..."
              value={form.currentPlatform}
              onChange={(event) => set('currentPlatform')(event.target.value)}
            />
          </Field>
          <Field label="Country" htmlFor="merchantCountry" error={error('country')}>
            <Input
              id="merchantCountry"
              value={form.country}
              onChange={(event) => set('country')(event.target.value)}
            />
          </Field>
          <Field label="Industry" htmlFor="merchantIndustry" error={error('industry')}>
            <Input
              id="merchantIndustry"
              value={form.industry}
              onChange={(event) => set('industry')(event.target.value)}
            />
          </Field>
        </div>

        <div className="border-line border-t pt-4">
          <p className="text-ink mb-3 text-[13px] font-medium">Primary contact</p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Name" htmlFor="contactName" required error={error('contact.name')}>
              <Input
                id="contactName"
                value={form.contactName}
                onChange={(event) => set('contactName')(event.target.value)}
              />
            </Field>
            <Field label="Email" htmlFor="contactEmail" required error={error('contact.email')}>
              <Input
                id="contactEmail"
                type="email"
                value={form.contactEmail}
                onChange={(event) => set('contactEmail')(event.target.value)}
              />
            </Field>
            <Field label="Phone" htmlFor="contactPhone" error={error('contact.phone')}>
              <Input
                id="contactPhone"
                type="tel"
                value={form.contactPhone}
                onChange={(event) => set('contactPhone')(event.target.value)}
              />
            </Field>
            <Field label="Job title" htmlFor="contactTitle" error={error('contact.title')}>
              <Input
                id="contactTitle"
                value={form.contactTitle}
                onChange={(event) => set('contactTitle')(event.target.value)}
              />
            </Field>
          </div>
        </div>

        <Field label="Notes" htmlFor="merchantNotes" error={error('notes')}>
          <Textarea
            id="merchantNotes"
            rows={2}
            value={form.notes}
            onChange={(event) => set('notes')(event.target.value)}
          />
        </Field>

        <FormActions>
          <Button
            variant="primary"
            size="sm"
            loading={action.pending}
            disabled={form.name.trim().length < 2}
            onClick={() =>
              action.run({
                code,
                name: form.name,
                website: form.website,
                shoplineStoreId: form.shoplineStoreId,
                currentPlatform: form.currentPlatform,
                country: form.country,
                industry: form.industry,
                notes: form.notes,
                contact: {
                  name: form.contactName,
                  email: form.contactEmail,
                  phone: form.contactPhone,
                  title: form.contactTitle,
                },
              })
            }
          >
            <Save className="size-3.5" />
            Save merchant details
          </Button>
        </FormActions>
      </CardBody>
    </Card>
  );
}

export function ProjectDetailsForm({
  code,
  startDate,
  migrationType,
  targetLaunchDate,
  scopeSummary,
  deploymentNotes,
  contractTotal,
}: {
  code: string;
  startDate: string;
  migrationType: MigrationType;
  targetLaunchDate: string | null;
  scopeSummary: string | null;
  deploymentNotes: string | null;
  contractTotal: number | null;
}) {
  const [form, setForm] = useState({
    startDate: startDate.slice(0, 10),
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
        description="Start and target launch dates drive the ageing and ahead/behind figures everywhere else."
      />
      <CardBody className="space-y-4">
        {action.error && (
          <Alert tone="danger" dense>
            {action.error}
          </Alert>
        )}

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
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
            label="Start date"
            htmlFor="startDate"
            required
            error={action.fieldErrors.startDate ?? null}
            hint="Changes the project's age everywhere it's shown."
          >
            <Input
              id="startDate"
              type="date"
              value={form.startDate}
              onChange={(event) => setForm({ ...form, startDate: event.target.value })}
            />
          </Field>
          <Field
            label="Target launch date"
            htmlFor="targetLaunchDate"
            error={action.fieldErrors.targetLaunchDate ?? null}
          >
            <Input
              id="targetLaunchDate"
              type="date"
              min={form.startDate || undefined}
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
                startDate: form.startDate || undefined,
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
    ahnDesignerId: string | null;
    shoplineAmId: string | null;
    shoplineSeId: string | null;
  };
}) {
  const [form, setForm] = useState({
    ahnProjectManagerId: current.ahnProjectManagerId ?? '',
    ahnDeveloperId: current.ahnDeveloperId ?? '',
    ahnDesignerId: current.ahnDesignerId ?? '',
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
            {personOptionLabel(person)}
          </option>
        ))}
      </Select>
    </Field>
  );

  return (
    <Card>
      <CardHeader
        title="Who is responsible"
        description="These five names are who gets notified when something needs a decision."
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
          'AHN designer',
          'ahnDesignerId',
          ahn,
          'Owns the visual design and merchant design review.',
        )}
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
                ahnDesignerId: form.ahnDesignerId || null,
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
