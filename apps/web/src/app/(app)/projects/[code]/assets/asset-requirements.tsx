'use client';

import { useState } from 'react';
import { Settings2 } from 'lucide-react';
import { Badge, Button, Dialog, Field, FormActions, Input } from '@relay/ui';
import { useAction } from '@/components/use-action';
import { updateAssetRequirementsAction } from '@/features/checklists/actions';

/**
 * The spec AHN expects for one asset - shown to whoever is looking (AHN or
 * the merchant), never enforced against the actual uploaded file. A merchant
 * genuinely knows their own logo's real dimensions; the point of this is to
 * tell them what to prepare before they upload, not to reject what they send.
 */
export function AssetRequirementsSummary({
  requiredFileTypes,
  requiredDimensions,
  maxSizeMb,
}: {
  requiredFileTypes: string[];
  requiredDimensions: string | null;
  maxSizeMb: number | null;
}) {
  if (requiredFileTypes.length === 0 && !requiredDimensions && !maxSizeMb) return null;

  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
      {requiredFileTypes.map((type) => (
        <Badge key={type} tone="accent" size="sm" variant="outline">
          {type}
        </Badge>
      ))}
      {requiredDimensions && <span className="text-muted text-[11.5px]">{requiredDimensions}</span>}
      {maxSizeMb && <span className="text-muted text-[11.5px]">up to {maxSizeMb}MB</span>}
    </div>
  );
}

export function EditAssetRequirementsButton({
  code,
  itemId,
  requiredFileTypes,
  requiredDimensions,
  maxSizeMb,
}: {
  code: string;
  itemId: string;
  requiredFileTypes: string[];
  requiredDimensions: string | null;
  maxSizeMb: number | null;
}) {
  const [open, setOpen] = useState(false);
  const [fileTypes, setFileTypes] = useState(requiredFileTypes.join(', '));
  const [dimensions, setDimensions] = useState(requiredDimensions ?? '');
  const [maxSize, setMaxSize] = useState(maxSizeMb ? String(maxSizeMb) : '');

  const action = useAction(updateAssetRequirementsAction, {
    successMessage: 'Requirements updated.',
    onSuccess: () => setOpen(false),
  });

  return (
    <>
      <Button variant="ghost" size="xs" onClick={() => setOpen(true)}>
        <Settings2 className="size-3.5" />
        Spec
      </Button>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="File spec for this item"
        description="Tell the merchant exactly what to prepare - shown on their side, not checked against what they actually upload."
        size="sm"
        busy={action.pending}
        footer={
          <FormActions>
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
                  itemId,
                  requiredFileTypes: fileTypes
                    .split(',')
                    .map((value) => value.trim())
                    .filter(Boolean),
                  requiredDimensions: dimensions.trim() || undefined,
                  maxSizeMb: maxSize.trim() ? Number(maxSize) : undefined,
                })
              }
            >
              Save
            </Button>
          </FormActions>
        }
      >
        <div className="space-y-3">
          <Field
            label="Accepted file types"
            htmlFor="asset-file-types"
            hint="Comma-separated - PNG, JPG, SVG"
            error={action.fieldErrors.requiredFileTypes ?? null}
          >
            <Input
              id="asset-file-types"
              value={fileTypes}
              onChange={(event) => setFileTypes(event.target.value)}
              placeholder="PNG, JPG"
            />
          </Field>
          <Field
            label="Dimensions"
            htmlFor="asset-dimensions"
            hint="Free text - 1200x630px minimum"
            error={action.fieldErrors.requiredDimensions ?? null}
          >
            <Input
              id="asset-dimensions"
              value={dimensions}
              onChange={(event) => setDimensions(event.target.value)}
              placeholder="1200x630px minimum"
            />
          </Field>
          <Field
            label="Max file size (MB)"
            htmlFor="asset-max-size"
            error={action.fieldErrors.maxSizeMb ?? null}
          >
            <Input
              id="asset-max-size"
              type="number"
              min={1}
              value={maxSize}
              onChange={(event) => setMaxSize(event.target.value)}
              placeholder="10"
            />
          </Field>
        </div>
      </Dialog>
    </>
  );
}
