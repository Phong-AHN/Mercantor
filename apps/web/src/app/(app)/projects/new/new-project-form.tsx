'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight } from 'lucide-react';
import { MIGRATION_TYPE_LABEL, MIGRATION_TYPES, type MigrationType } from '@relay/core';
import {
  Alert,
  Button,
  Card,
  CardBody,
  CardHeader,
  Field,
  Fieldset,
  FormActions,
  Input,
  Select,
  Textarea,
} from '@relay/ui';
import { useAction } from '@/components/use-action';
import { createProjectAction } from '@/features/projects/create';

interface Person {
  id: string;
  name: string;
  title?: string | null;
}

export function NewProjectForm({
  ahn,
  shopline,
  canManageMoney,
}: {
  ahn: Person[];
  shopline: Person[];
  canManageMoney: boolean;
}) {
  const router = useRouter();
  const [form, setForm] = useState({
    merchantName: '',
    website: '',
    shoplineStoreId: '',
    currentPlatform: '',
    country: '',
    industry: '',
    contactName: '',
    contactEmail: '',
    contactPhone: '',
    contactTitle: '',
    migrationType: 'ONE_TO_ONE' as MigrationType,
    targetLaunchDate: '',
    scopeSummary: '',
    contractTotal: '',
    ahnProjectManagerId: '',
    ahnDeveloperId: '',
    shoplineAmId: '',
    shoplineSeId: '',
  });

  const action = useAction(createProjectAction, {
    onSuccess: (data) => router.push(`/projects/${data.code}`),
  });

  const set = (key: keyof typeof form) => (value: string) => setForm({ ...form, [key]: value });

  return (
    <Card>
      <CardHeader
        title="Project details"
        description="Everything here is editable afterwards. The merchant contact is what the introduction email is addressed to."
      />
      <CardBody className="space-y-6">
        {action.error && !Object.keys(action.fieldErrors).length && (
          <Alert tone="danger" dense>
            {action.error}
          </Alert>
        )}

        <Fieldset legend="Merchant">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field
              label="Merchant name"
              htmlFor="merchantName"
              required
              error={action.fieldErrors.merchantName ?? null}
            >
              <Input
                id="merchantName"
                value={form.merchantName}
                onChange={(event) => set('merchantName')(event.target.value)}
                placeholder="Sunrise Coffee Roasters"
                autoFocus
              />
            </Field>
            <Field label="Website" htmlFor="website" error={action.fieldErrors.website ?? null}>
              <Input
                id="website"
                type="url"
                value={form.website}
                onChange={(event) => set('website')(event.target.value)}
                placeholder="https://example.com"
              />
            </Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="SHOPLINE store ID" htmlFor="shoplineStoreId">
              <Input
                id="shoplineStoreId"
                value={form.shoplineStoreId}
                onChange={(event) => set('shoplineStoreId')(event.target.value)}
                placeholder="SL-00000"
              />
            </Field>
            <Field label="Current platform" htmlFor="currentPlatform">
              <Input
                id="currentPlatform"
                value={form.currentPlatform}
                onChange={(event) => set('currentPlatform')(event.target.value)}
                placeholder="Shopify Plus"
              />
            </Field>
            <Field label="Country" htmlFor="country">
              <Input
                id="country"
                value={form.country}
                onChange={(event) => set('country')(event.target.value)}
              />
            </Field>
            <Field label="Industry" htmlFor="industry">
              <Input
                id="industry"
                value={form.industry}
                onChange={(event) => set('industry')(event.target.value)}
              />
            </Field>
          </div>
        </Fieldset>

        <Fieldset
          legend="Primary contact"
          description="Who the introduction email goes to. Without this the introduction cannot be sent."
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <Field
              label="Name"
              htmlFor="contactName"
              required
              error={action.fieldErrors.contactName ?? null}
            >
              <Input
                id="contactName"
                value={form.contactName}
                onChange={(event) => set('contactName')(event.target.value)}
              />
            </Field>
            <Field
              label="Email"
              htmlFor="contactEmail"
              required
              error={action.fieldErrors.contactEmail ?? null}
            >
              <Input
                id="contactEmail"
                type="email"
                value={form.contactEmail}
                onChange={(event) => set('contactEmail')(event.target.value)}
              />
            </Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Phone" htmlFor="contactPhone">
              <Input
                id="contactPhone"
                value={form.contactPhone}
                onChange={(event) => set('contactPhone')(event.target.value)}
              />
            </Field>
            <Field label="Job title" htmlFor="contactTitle">
              <Input
                id="contactTitle"
                value={form.contactTitle}
                onChange={(event) => set('contactTitle')(event.target.value)}
              />
            </Field>
          </div>
        </Fieldset>

        <Fieldset legend="Scope & schedule">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field
              label="Migration type"
              htmlFor="migrationType"
              hint={MIGRATION_TYPE_LABEL[form.migrationType].hint}
            >
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
              hint="Drives the ahead/behind figures everywhere."
            >
              <Input
                id="targetLaunchDate"
                type="date"
                value={form.targetLaunchDate}
                onChange={(event) => set('targetLaunchDate')(event.target.value)}
              />
            </Field>
          </div>
          {canManageMoney && (
            <Field label="Contract value" htmlFor="contractTotal">
              <Input
                id="contractTotal"
                type="number"
                min={0}
                step="0.01"
                value={form.contractTotal}
                onChange={(event) => set('contractTotal')(event.target.value)}
              />
            </Field>
          )}
          <Field label="Scope summary" htmlFor="scopeSummary">
            <Textarea
              id="scopeSummary"
              value={form.scopeSummary}
              onChange={(event) => set('scopeSummary')(event.target.value)}
              rows={3}
              placeholder="One paragraph anyone can read to know what was agreed."
            />
          </Field>
        </Fieldset>

        <Fieldset
          legend="Who is responsible"
          description="These names decide who gets notified. They can be filled in later."
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="AHN project manager" htmlFor="ahnProjectManagerId">
              <Select
                id="ahnProjectManagerId"
                value={form.ahnProjectManagerId}
                onChange={(event) => set('ahnProjectManagerId')(event.target.value)}
              >
                <option value="">Not assigned yet</option>
                {ahn.map((person) => (
                  <option key={person.id} value={person.id}>
                    {person.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="AHN developer" htmlFor="ahnDeveloperId">
              <Select
                id="ahnDeveloperId"
                value={form.ahnDeveloperId}
                onChange={(event) => set('ahnDeveloperId')(event.target.value)}
              >
                <option value="">Not assigned yet</option>
                {ahn.map((person) => (
                  <option key={person.id} value={person.id}>
                    {person.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="SHOPLINE account manager" htmlFor="shoplineAmId">
              <Select
                id="shoplineAmId"
                value={form.shoplineAmId}
                onChange={(event) => set('shoplineAmId')(event.target.value)}
              >
                <option value="">Not assigned yet</option>
                {shopline.map((person) => (
                  <option key={person.id} value={person.id}>
                    {person.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="SHOPLINE solutions engineer" htmlFor="shoplineSeId">
              <Select
                id="shoplineSeId"
                value={form.shoplineSeId}
                onChange={(event) => set('shoplineSeId')(event.target.value)}
              >
                <option value="">Not assigned yet</option>
                {shopline.map((person) => (
                  <option key={person.id} value={person.id}>
                    {person.name}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
        </Fieldset>

        <FormActions>
          <Button
            variant="primary"
            size="md"
            loading={action.pending}
            onClick={() =>
              action.run({
                merchantName: form.merchantName,
                website: form.website || undefined,
                shoplineStoreId: form.shoplineStoreId || undefined,
                currentPlatform: form.currentPlatform || undefined,
                country: form.country || undefined,
                industry: form.industry || undefined,
                contactName: form.contactName,
                contactEmail: form.contactEmail,
                contactPhone: form.contactPhone || undefined,
                contactTitle: form.contactTitle || undefined,
                migrationType: form.migrationType,
                targetLaunchDate: form.targetLaunchDate || undefined,
                scopeSummary: form.scopeSummary || undefined,
                contractTotal: form.contractTotal ? Number(form.contractTotal) : undefined,
                ahnProjectManagerId: form.ahnProjectManagerId || undefined,
                ahnDeveloperId: form.ahnDeveloperId || undefined,
                shoplineAmId: form.shoplineAmId || undefined,
                shoplineSeId: form.shoplineSeId || undefined,
              })
            }
          >
            Create project
            <ArrowRight className="size-4" />
          </Button>
        </FormActions>
      </CardBody>
    </Card>
  );
}
