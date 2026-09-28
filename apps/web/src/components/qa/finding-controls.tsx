'use client';

import { useState } from 'react';
import { Ban, Eye, EyeOff, Flag, Send } from 'lucide-react';
import {
  FINDING_CATEGORIES,
  FINDING_CATEGORY_LABEL,
  FINDING_SEVERITIES,
  FINDING_SEVERITY_LABEL,
  FINDING_STATUS_LABEL,
  nextFindingStatuses,
  type FindingCategory,
  type FindingSeverity,
  type FindingStatus,
} from '@relay/core';
import { Alert, Button, Checkbox, Dialog, Field, Input, Select, Textarea } from '@relay/ui';
import { useAction } from '@/components/use-action';
import {
  commentOnFindingAction,
  createFindingAction,
  markFalsePositiveAction,
  setFindingVisibilityAction,
  updateFindingAction,
} from '@/features/qa/finding-actions';

interface Person {
  id: string;
  name: string;
}

export function LogFindingButton({
  code,
  people,
  pages,
}: {
  code: string;
  people: Person[];
  pages: string[];
}) {
  const [open, setOpen] = useState(false);
  const empty = {
    url: pages[0] ?? '',
    category: 'SPELLING' as FindingCategory,
    severity: 'MEDIUM' as FindingSeverity,
    title: '',
    evidenceText: '',
    suggestion: '',
    recommendation: '',
    assigneeId: '',
  };
  const [form, setForm] = useState(empty);
  const action = useAction(createFindingAction, {
    onSuccess: () => {
      setOpen(false);
      setForm(empty);
    },
  });

  return (
    <>
      <Button variant="primary" size="sm" onClick={() => setOpen(true)}>
        <Flag className="size-3.5" />
        Log a finding
      </Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Log a finding"
        description="Something wrong on a page: a typo, a broken link, a layout problem, an improvement worth suggesting."
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
                  url: form.url,
                  category: form.category,
                  severity: form.severity,
                  title: form.title,
                  evidenceText: form.evidenceText || undefined,
                  suggestion: form.suggestion || undefined,
                  recommendation: form.recommendation || undefined,
                  assigneeId: form.assigneeId || undefined,
                })
              }
            >
              Log finding
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          {action.error && (
            <Alert tone="danger" dense>
              {action.error}
            </Alert>
          )}
          <Field label="Page" htmlFor="f-url" required error={action.fieldErrors.url ?? null}>
            <Input
              id="f-url"
              list="f-url-pages"
              value={form.url}
              onChange={(e) => setForm({ ...form, url: e.target.value })}
              placeholder="https://shop.example.com/products/..."
            />
            <datalist id="f-url-pages">
              {pages.map((url) => (
                <option key={url} value={url} />
              ))}
            </datalist>
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Category" htmlFor="f-category">
              <Select
                id="f-category"
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value as FindingCategory })}
              >
                {FINDING_CATEGORIES.map((value) => (
                  <option key={value} value={value}>
                    {FINDING_CATEGORY_LABEL[value].label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Severity" htmlFor="f-severity">
              <Select
                id="f-severity"
                value={form.severity}
                onChange={(e) => setForm({ ...form, severity: e.target.value as FindingSeverity })}
              >
                {FINDING_SEVERITIES.map((value) => (
                  <option key={value} value={value}>
                    {FINDING_SEVERITY_LABEL[value].label}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <Field label="What is wrong" htmlFor="f-title" required error={action.fieldErrors.title ?? null}>
            <Input
              id="f-title"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder='e.g. "Recieve" is misspelled in the shipping banner'
            />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Evidence" htmlFor="f-evidence" hint="The exact text or element, as it appears.">
              <Textarea
                id="f-evidence"
                rows={3}
                value={form.evidenceText}
                onChange={(e) => setForm({ ...form, evidenceText: e.target.value })}
              />
            </Field>
            <Field label="Suggested correction" htmlFor="f-suggestion">
              <Textarea
                id="f-suggestion"
                rows={3}
                value={form.suggestion}
                onChange={(e) => setForm({ ...form, suggestion: e.target.value })}
              />
            </Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Recommended action" htmlFor="f-recommendation">
              <Input
                id="f-recommendation"
                value={form.recommendation}
                onChange={(e) => setForm({ ...form, recommendation: e.target.value })}
              />
            </Field>
            <Field label="Assign to" htmlFor="f-assignee">
              <Select
                id="f-assignee"
                value={form.assigneeId}
                onChange={(e) => setForm({ ...form, assigneeId: e.target.value })}
              >
                <option value="">Nobody yet</option>
                {people.map((person) => (
                  <option key={person.id} value={person.id}>
                    {person.name}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
        </div>
      </Dialog>
    </>
  );
}

const NEEDS_NOTE: Partial<Record<FindingStatus, { label: string; hint: string }>> = {
  RESOLVED: { label: 'How was it verified?', hint: 'e.g. "Checked the live page on desktop and mobile."' },
  DISMISSED: { label: 'Why dismiss it?', hint: 'e.g. "Intentional brand spelling."' },
  IN_PROGRESS: { label: 'Note', hint: 'Optional.' },
};

const MOVE_LABEL: Partial<Record<FindingStatus, string>> = {
  REVIEWED: 'Mark reviewed',
  IN_PROGRESS: 'Start work',
  READY_FOR_VERIFICATION: 'Ready for verification',
  RESOLVED: 'Resolve',
  DISMISSED: 'Dismiss',
  NEW: 'Reopen',
};

export function FindingWorkflow({
  code,
  findingId,
  status,
}: {
  code: string;
  findingId: string;
  status: FindingStatus;
}) {
  const [target, setTarget] = useState<FindingStatus | null>(null);
  const [note, setNote] = useState('');
  const action = useAction(updateFindingAction, {
    onSuccess: () => {
      setTarget(null);
      setNote('');
    },
  });
  const moves = nextFindingStatuses(status);

  function start(to: FindingStatus) {
    if (NEEDS_NOTE[to]) {
      setNote('');
      setTarget(to);
    } else {
      void action.run({ code, findingId, status: to });
    }
  }

  const prompt = target ? NEEDS_NOTE[target] : null;
  const label = (to: FindingStatus) =>
    status === 'READY_FOR_VERIFICATION' && to === 'IN_PROGRESS'
      ? 'Failed verification'
      : status === 'RESOLVED' && to === 'IN_PROGRESS'
        ? 'Reopen'
        : (MOVE_LABEL[to] ?? FINDING_STATUS_LABEL[to].label);

  return (
    <div className="flex flex-wrap gap-1.5">
      {moves.map((to, index) => (
        <Button
          key={to}
          variant={index === 0 && to !== 'DISMISSED' ? 'primary' : 'secondary'}
          size="sm"
          disabled={action.pending}
          onClick={() => start(to)}
        >
          {label(to)}
        </Button>
      ))}
      <Dialog
        open={target !== null}
        onClose={() => setTarget(null)}
        title={target ? label(target) : ''}
        size="sm"
        busy={action.pending}
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setTarget(null)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              loading={action.pending}
              onClick={() => target && action.run({ code, findingId, status: target, note })}
            >
              Save
            </Button>
          </>
        }
      >
        {prompt && (
          <Field label={prompt.label} htmlFor="move-note" hint={prompt.hint} error={action.fieldErrors.note ?? null}>
            <Textarea id="move-note" rows={3} value={note} onChange={(e) => setNote(e.target.value)} autoFocus />
          </Field>
        )}
      </Dialog>
    </div>
  );
}

export function FindingMeta({
  code,
  findingId,
  severity,
  assigneeId,
  people,
}: {
  code: string;
  findingId: string;
  severity: FindingSeverity;
  assigneeId: string | null;
  people: Person[];
}) {
  const action = useAction(updateFindingAction);
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label="Severity" htmlFor="meta-severity">
        <Select
          id="meta-severity"
          value={severity}
          disabled={action.pending}
          onChange={(e) =>
            action.run({ code, findingId, severity: e.target.value as FindingSeverity })
          }
        >
          {FINDING_SEVERITIES.map((value) => (
            <option key={value} value={value}>
              {FINDING_SEVERITY_LABEL[value].label}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Assignee" htmlFor="meta-assignee">
        <Select
          id="meta-assignee"
          value={assigneeId ?? ''}
          disabled={action.pending}
          onChange={(e) => action.run({ code, findingId, assigneeId: e.target.value || null })}
        >
          <option value="">Unassigned</option>
          {people.map((person) => (
            <option key={person.id} value={person.id}>
              {person.name}
            </option>
          ))}
        </Select>
      </Field>
    </div>
  );
}

export function ShareFindingsButton({
  code,
  findingIds,
  visible,
  label,
}: {
  code: string;
  findingIds: string[];
  visible: boolean;
  label?: string;
}) {
  const action = useAction(setFindingVisibilityAction);
  return (
    <Button
      variant={visible ? 'secondary' : 'subtle'}
      size="sm"
      disabled={findingIds.length === 0}
      loading={action.pending}
      onClick={() => action.run({ code, findingIds, visible })}
    >
      {visible ? <Eye className="size-3.5" /> : <EyeOff className="size-3.5" />}
      {label ?? (visible ? 'Share with client' : 'Hide from client')}
    </Button>
  );
}

export function FalsePositiveButton({ code, findingId }: { code: string; findingId: string }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const action = useAction(markFalsePositiveAction, { onSuccess: () => setOpen(false) });
  return (
    <>
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
        <Ban className="size-3.5" />
        False positive
      </Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Mark as a false positive"
        description="It is dismissed and remembered: the same check will not raise it again on this page."
        size="sm"
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
              onClick={() => action.run({ code, findingId, reason })}
            >
              Mark false positive
            </Button>
          </>
        }
      >
        <Field label="Why is this not a problem?" htmlFor="fp-reason" error={action.fieldErrors.reason ?? null}>
          <Textarea id="fp-reason" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} autoFocus />
        </Field>
      </Dialog>
    </>
  );
}

export function FindingCommentForm({
  code,
  findingId,
  canChooseVisibility,
  shared,
}: {
  code: string;
  findingId: string;
  /** Agency users choose; a merchant's comment is always visible to both sides. */
  canChooseVisibility: boolean;
  shared: boolean;
}) {
  const [body, setBody] = useState('');
  const [clientVisible, setClientVisible] = useState(shared);
  const action = useAction(commentOnFindingAction, { onSuccess: () => setBody('') });
  return (
    <div className="space-y-2">
      <Textarea
        aria-label="Comment"
        rows={3}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Add a comment"
      />
      <div className="flex flex-wrap items-center justify-between gap-2">
        {canChooseVisibility ? (
          <Checkbox
            id={`visible-${findingId}`}
            label="Visible to the client"
            hint={shared ? undefined : 'Share the finding first to talk to the client on it.'}
            checked={shared && clientVisible}
            disabled={!shared}
            onChange={(e) => setClientVisible(e.target.checked)}
          />
        ) : (
          <span />
        )}
        <Button
          variant="primary"
          size="sm"
          loading={action.pending}
          disabled={!body.trim()}
          onClick={() => action.run({ code, findingId, body, clientVisible: shared && clientVisible })}
        >
          <Send className="size-3.5" />
          Post
        </Button>
      </div>
    </div>
  );
}
