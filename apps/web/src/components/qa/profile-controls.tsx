'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Eye, EyeOff, Pencil, ScanSearch } from 'lucide-react';
import {
  ENGAGEMENT_TYPE_LABEL,
  ENGAGEMENT_TYPES,
  STOREFRONT_BUILD_LABEL,
  STOREFRONT_BUILDS,
  STOREFRONT_PLATFORM_LABEL,
  STOREFRONT_PLATFORMS,
  type EngagementType,
  type StorefrontBuild,
  type StorefrontPlatform,
} from '@relay/core';
import { Alert, Button, Checkbox, cn, Dialog, Field, Input, Select, Textarea } from '@relay/ui';
import { useAction } from '@/components/use-action';
import {
  detectStorefrontAction,
  saveStorefrontProfileAction,
  setShowcasePublishedAction,
} from '@/features/qa/actions';

export function QaNav({ base, counts }: { base: string; counts: { findings: number } }) {
  const pathname = usePathname();
  const items = [
    { href: base, label: 'Overview' },
    { href: `${base}/findings`, label: 'Findings', count: counts.findings },
    { href: `${base}/comparisons`, label: 'Before & after' },
    { href: `${base}/performance`, label: 'Performance' },
  ];
  return (
    <nav className="flex flex-wrap gap-1.5" aria-label="Site QA sections">
      {items.map((item) => {
        const active = item.href === base ? pathname === base : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12.5px] font-medium transition-colors',
              active
                ? 'border-ink bg-ink text-canvas'
                : 'border-line bg-surface-1 text-muted hover:border-line-strong hover:text-ink',
            )}
          >
            {item.label}
            {item.count !== undefined && item.count > 0 && (
              <span className="tabular text-[11px] opacity-70">{item.count}</span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}

export interface ProfileFormValues {
  storefrontUrl: string;
  destinationUrl: string;
  sourcePlatform: StorefrontPlatform;
  destinationPlatform: StorefrontPlatform;
  build: StorefrontBuild;
  themeName: string;
  themeVersion: string;
  engagementType: EngagementType | '';
  headline: string;
  summary: string;
  serviceTags: string;
  destinationBuildLabel: string;
  apps: string;
  /** Write-only: always starts empty; the saved password is never sent to the browser. */
  storefrontPassword: string;
  destinationPassword: string;
  clearStorefrontPassword: boolean;
  clearDestinationPassword: boolean;
  /** Whether one is saved - the only thing the page knows about it. */
  hasStorefrontPassword: boolean;
  hasDestinationPassword: boolean;
}

export function ProfileButton({
  code,
  initial,
  mode,
}: {
  code: string;
  initial: ProfileFormValues;
  mode: 'create' | 'edit' | 'confirm';
}) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(initial);
  const action = useAction(saveStorefrontProfileAction, { onSuccess: () => setOpen(false) });
  const set = <K extends keyof ProfileFormValues>(key: K, value: ProfileFormValues[K]) =>
    setForm({ ...form, [key]: value });

  const label =
    mode === 'create' ? 'Set up storefront' : mode === 'confirm' ? 'Confirm or correct' : 'Edit';

  return (
    <>
      <Button
        variant={mode === 'edit' ? 'subtle' : 'primary'}
        size="sm"
        onClick={() => {
          setForm(initial);
          setOpen(true);
        }}
      >
        <Pencil className="size-3.5" />
        {label}
      </Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={mode === 'create' ? 'Set up the storefront' : 'Storefront details'}
        description="Saving confirms the platform and theme. Change anything the detection got wrong first."
        size="lg"
        busy={action.pending}
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              loading={action.pending}
              onClick={() =>
                action.run({
                  code,
                  ...form,
                  engagementType: form.engagementType || null,
                })
              }
            >
              Save
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {action.error && (
            <Alert tone="danger" dense>
              {action.error}
            </Alert>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <Field
              label="Current storefront"
              htmlFor="storefrontUrl"
              required
              error={action.fieldErrors.storefrontUrl ?? null}
            >
              <Input
                id="storefrontUrl"
                value={form.storefrontUrl}
                onChange={(e) => set('storefrontUrl', e.target.value)}
                placeholder="https://shop.example.com"
              />
            </Field>
            <Field
              label="New Shopline storefront"
              htmlFor="destinationUrl"
              hint="Preview or live URL of the build. After captures come from here."
              error={action.fieldErrors.destinationUrl ?? null}
            >
              <Input
                id="destinationUrl"
                value={form.destinationUrl}
                onChange={(e) => set('destinationUrl', e.target.value)}
                placeholder="https://example.myshopline.com"
              />
            </Field>
          </div>

          <fieldset className="border-line space-y-3 rounded-[var(--radius-md)] border p-3">
            <legend className="text-ink px-1 text-[13px] font-semibold">
              Storefront passwords
            </legend>
            <p className="text-muted -mt-1 text-[12.5px]">
              Only for stores behind a password page (an unlaunched store or a preview). Checks,
              speed tests and screenshots use it to get past that page. Stored encrypted and never
              shown again.
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              {(
                [
                  [
                    'storefrontPassword',
                    'clearStorefrontPassword',
                    'hasStorefrontPassword',
                    'Current storefront password',
                  ],
                  [
                    'destinationPassword',
                    'clearDestinationPassword',
                    'hasDestinationPassword',
                    'New storefront password',
                  ],
                ] as const
              ).map(([field, clearField, hasField, fieldLabel]) => (
                <Field
                  key={field}
                  label={fieldLabel}
                  htmlFor={field}
                  hint={
                    form[hasField]
                      ? form[clearField]
                        ? 'The saved password will be removed.'
                        : 'A password is saved. Type a new one to replace it.'
                      : 'Leave empty if the store is not password protected.'
                  }
                  error={action.fieldErrors[field] ?? null}
                >
                  <Input
                    id={field}
                    type="password"
                    autoComplete="new-password"
                    value={form[field]}
                    disabled={form[clearField]}
                    onChange={(e) => set(field, e.target.value)}
                    placeholder={form[hasField] ? '••••••••  (saved)' : ''}
                  />
                  {form[hasField] && (
                    <Checkbox
                      id={`${clearField}-box`}
                      className="mt-1"
                      label="Remove the saved password"
                      checked={form[clearField]}
                      onChange={(e) =>
                        setForm({ ...form, [clearField]: e.target.checked, [field]: '' })
                      }
                    />
                  )}
                </Field>
              ))}
            </div>
          </fieldset>

          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Current platform" htmlFor="sourcePlatform">
              <Select
                id="sourcePlatform"
                value={form.sourcePlatform}
                onChange={(e) => set('sourcePlatform', e.target.value as StorefrontPlatform)}
              >
                {STOREFRONT_PLATFORMS.map((value) => (
                  <option key={value} value={value}>
                    {STOREFRONT_PLATFORM_LABEL[value].label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="How it is built" htmlFor="build">
              <Select
                id="build"
                value={form.build}
                onChange={(e) => set('build', e.target.value as StorefrontBuild)}
              >
                {STOREFRONT_BUILDS.map((value) => (
                  <option key={value} value={value}>
                    {STOREFRONT_BUILD_LABEL[value].label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Moving to" htmlFor="destinationPlatform">
              <Select
                id="destinationPlatform"
                value={form.destinationPlatform}
                onChange={(e) => set('destinationPlatform', e.target.value as StorefrontPlatform)}
              >
                {STOREFRONT_PLATFORMS.map((value) => (
                  <option key={value} value={value}>
                    {STOREFRONT_PLATFORM_LABEL[value].label}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Theme" htmlFor="themeName">
              <Input
                id="themeName"
                value={form.themeName}
                onChange={(e) => set('themeName', e.target.value)}
                placeholder="e.g. Dawn"
              />
            </Field>
            <Field label="Theme version" htmlFor="themeVersion">
              <Input
                id="themeVersion"
                value={form.themeVersion}
                onChange={(e) => set('themeVersion', e.target.value)}
                placeholder="e.g. 15.0.0"
              />
            </Field>
            <Field label="New build" htmlFor="destinationBuildLabel" hint="e.g. Shopline OS 3.0">
              <Input
                id="destinationBuildLabel"
                value={form.destinationBuildLabel}
                onChange={(e) => set('destinationBuildLabel', e.target.value)}
              />
            </Field>
          </div>

          <Field
            label="Installed apps"
            htmlFor="apps"
            hint="One per line or comma separated. Detection fills this in; edit to correct it."
          >
            <Textarea
              id="apps"
              rows={2}
              value={form.apps}
              onChange={(e) => set('apps', e.target.value)}
            />
          </Field>

          <div className="border-line space-y-3 border-t pt-4">
            <p className="text-muted text-[12px] font-medium uppercase tracking-wide">
              Showcase card
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Engagement" htmlFor="engagementType">
                <Select
                  id="engagementType"
                  value={form.engagementType}
                  onChange={(e) => set('engagementType', e.target.value as EngagementType | '')}
                >
                  <option value="">Not set</option>
                  {ENGAGEMENT_TYPES.map((value) => (
                    <option key={value} value={value}>
                      {ENGAGEMENT_TYPE_LABEL[value].label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field
                label="Service tags"
                htmlFor="serviceTags"
                hint="Comma separated, e.g. Design, Build"
              >
                <Input
                  id="serviceTags"
                  value={form.serviceTags}
                  onChange={(e) => set('serviceTags', e.target.value)}
                />
              </Field>
            </div>
            <Field label="Headline" htmlFor="headline">
              <Input
                id="headline"
                value={form.headline}
                onChange={(e) => set('headline', e.target.value)}
                placeholder="A faster, cleaner storefront on Shopline"
              />
            </Field>
            <Field label="Summary" htmlFor="summary">
              <Textarea
                id="summary"
                rows={3}
                value={form.summary}
                onChange={(e) => set('summary', e.target.value)}
              />
            </Field>
          </div>
        </div>
      </Dialog>
    </>
  );
}

export function DetectButton({ code }: { code: string }) {
  const action = useAction(detectStorefrontAction);
  return (
    <Button
      variant="secondary"
      size="sm"
      loading={action.pending}
      onClick={() => action.run({ code })}
    >
      <ScanSearch className="size-3.5" />
      Detect platform
    </Button>
  );
}

export function PublishToggle({ code, published }: { code: string; published: boolean }) {
  const action = useAction(setShowcasePublishedAction);
  return (
    <Button
      variant={published ? 'subtle' : 'secondary'}
      size="sm"
      loading={action.pending}
      onClick={() => action.run({ code, published: !published })}
    >
      {published ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
      {published ? 'Unpublish' : 'Publish to client'}
    </Button>
  );
}
