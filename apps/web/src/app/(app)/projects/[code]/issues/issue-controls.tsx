'use client';

import { useState } from 'react';
import { Bug, SquareKanban, SquareArrowOutUpRight, Settings2 } from 'lucide-react';
import {
  ISSUE_SEVERITIES,
  ISSUE_SEVERITY_LABEL,
  ISSUE_STATUS_LABEL,
  ISSUE_STATUSES,
  TEAM_LABEL,
  TEAMS,
  type IssueSeverity,
  type IssueStatus,
  type Team,
} from '@relay/core';
import { Alert, Button, Dialog, Field, Input, Select, Textarea } from '@relay/ui';
import { useAction } from '@/components/use-action';
import {
  createClickUpTaskAction,
  createIssueAction,
  updateIssueAction,
} from '@/features/issues/actions';

interface Person {
  id: string;
  name: string;
}

export function ReportIssueButton({ code, people }: { code: string; people: Person[] }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    title: '',
    description: '',
    severity: 'MEDIUM' as IssueSeverity,
    ownerTeam: 'AHN' as Team,
    ownerUserId: '',
    dueDate: '',
  });
  const action = useAction(createIssueAction, { onSuccess: () => setOpen(false) });

  return (
    <>
      <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
        <Bug className="size-3.5" />
        Report an issue
      </Button>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Report an issue"
        description="Anything wrong with the migration, the build, or the data. A launch blocker changes the project's health immediately."
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
                  title: form.title,
                  description: form.description,
                  severity: form.severity,
                  ownerTeam: form.ownerTeam,
                  ownerUserId: form.ownerUserId || undefined,
                  dueDate: form.dueDate || undefined,
                })
              }
            >
              Report issue
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

          <Field label="Title" htmlFor="title" required error={action.fieldErrors.title ?? null}>
            <Input
              id="title"
              value={form.title}
              onChange={(event) => setForm({ ...form, title: event.target.value })}
              placeholder="e.g. Subscription renewal dates shift by one day on import"
              autoFocus
            />
          </Field>

          <Field
            label="What is wrong"
            htmlFor="description"
            required
            hint="Steps to reproduce, what you expected, what happened."
            error={action.fieldErrors.description ?? null}
          >
            <Textarea
              id="description"
              value={form.description}
              onChange={(event) => setForm({ ...form, description: event.target.value })}
              rows={4}
            />
          </Field>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field
              label="Severity"
              htmlFor="severity"
              hint={
                form.severity === 'LAUNCH_BLOCKER'
                  ? 'This will mark the project blocked until it is closed.'
                  : undefined
              }
            >
              <Select
                id="severity"
                value={form.severity}
                onChange={(event) =>
                  setForm({ ...form, severity: event.target.value as IssueSeverity })
                }
              >
                {ISSUE_SEVERITIES.map((value) => (
                  <option key={value} value={value}>
                    {ISSUE_SEVERITY_LABEL[value].label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Due" htmlFor="dueDate">
              <Input
                id="dueDate"
                type="date"
                value={form.dueDate}
                onChange={(event) => setForm({ ...form, dueDate: event.target.value })}
              />
            </Field>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Owning team" htmlFor="ownerTeam">
              <Select
                id="ownerTeam"
                value={form.ownerTeam}
                onChange={(event) => setForm({ ...form, ownerTeam: event.target.value as Team })}
              >
                {TEAMS.map((value) => (
                  <option key={value} value={value}>
                    {TEAM_LABEL[value].label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Owner" htmlFor="ownerUserId">
              <Select
                id="ownerUserId"
                value={form.ownerUserId}
                onChange={(event) => setForm({ ...form, ownerUserId: event.target.value })}
              >
                <option value="">Team, not a person</option>
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

export function IssueControls({
  code,
  issueId,
  reference,
  status,
  severity,
  ownerTeam,
  people,
}: {
  code: string;
  issueId: string;
  reference: string;
  status: IssueStatus;
  severity: IssueSeverity;
  ownerTeam: Team;
  people: Person[];
}) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    status,
    severity,
    ownerTeam,
    ownerUserId: '',
    resolution: '',
  });
  const action = useAction(updateIssueAction, { onSuccess: () => setOpen(false) });
  const closing = form.status === 'RESOLVED' || form.status === 'WONT_FIX';

  return (
    <>
      <Button variant="subtle" size="sm" onClick={() => setOpen(true)}>
        <Settings2 className="size-3.5" />
        Update
      </Button>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={`Update ${reference}`}
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
              onClick={() =>
                action.run({
                  code,
                  issueId,
                  status: form.status,
                  severity: form.severity,
                  ownerTeam: form.ownerTeam,
                  ownerUserId: form.ownerUserId || undefined,
                  resolution: form.resolution || undefined,
                })
              }
            >
              Save
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

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Status" htmlFor="status">
              <Select
                id="status"
                value={form.status}
                onChange={(event) =>
                  setForm({ ...form, status: event.target.value as IssueStatus })
                }
              >
                {ISSUE_STATUSES.map((value) => (
                  <option key={value} value={value}>
                    {ISSUE_STATUS_LABEL[value].label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Severity" htmlFor="severity">
              <Select
                id="severity"
                value={form.severity}
                onChange={(event) =>
                  setForm({ ...form, severity: event.target.value as IssueSeverity })
                }
              >
                {ISSUE_SEVERITIES.map((value) => (
                  <option key={value} value={value}>
                    {ISSUE_SEVERITY_LABEL[value].label}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Owning team" htmlFor="ownerTeam">
              <Select
                id="ownerTeam"
                value={form.ownerTeam}
                onChange={(event) => setForm({ ...form, ownerTeam: event.target.value as Team })}
              >
                {TEAMS.map((value) => (
                  <option key={value} value={value}>
                    {TEAM_LABEL[value].label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Owner" htmlFor="ownerUserId">
              <Select
                id="ownerUserId"
                value={form.ownerUserId}
                onChange={(event) => setForm({ ...form, ownerUserId: event.target.value })}
              >
                <option value="">Leave unchanged</option>
                {people.map((person) => (
                  <option key={person.id} value={person.id}>
                    {person.name}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <Field
            label="Resolution"
            htmlFor="resolution"
            required={closing}
            hint={closing ? 'Required when closing an issue.' : 'Optional until you close it.'}
            error={action.fieldErrors.resolution ?? null}
          >
            <Textarea
              id="resolution"
              value={form.resolution}
              onChange={(event) => setForm({ ...form, resolution: event.target.value })}
              rows={3}
            />
          </Field>
        </div>
      </Dialog>
    </>
  );
}

/**
 * A direct action, not a dialog - there is nothing to fill in. The task is
 * created as a subtask of the project's linked ClickUp task, so this only
 * ever needs the issue id.
 */
export function CreateClickUpTaskButton({ code, issueId }: { code: string; issueId: string }) {
  const action = useAction(createClickUpTaskAction, { successMessage: 'ClickUp task created.' });

  return (
    <Button
      variant="subtle"
      size="sm"
      loading={action.pending}
      onClick={() => action.run({ code, issueId })}
    >
      <SquareKanban className="size-3.5" />
      Create ClickUp task
    </Button>
  );
}

export function ViewClickUpTaskLink({ url }: { url: string }) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer noopener"
      className="text-accent-ink flex items-center gap-1 text-[12px] font-medium underline-offset-4 hover:underline"
    >
      <SquareArrowOutUpRight className="size-3.5" />
      View in ClickUp
    </a>
  );
}
