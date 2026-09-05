'use client';

import { useState } from 'react';
import { CalendarClock, Check, Pencil, X } from 'lucide-react';
import { formatDate, TEAM_LABEL, TEAMS, type Team } from '@relay/core';
import {
  Alert,
  Button,
  Card,
  CardBody,
  CardHeader,
  cn,
  Field,
  Input,
  Select,
  TEAM_BAR,
} from '@relay/ui';
import { useAction } from '@/components/use-action';
import { setNextActionAction } from '@/features/projects/actions';

/**
 * "Who owns the next step" is one of the ten questions, so it gets a card of
 * its own rather than a row in a details list - and it is editable in place,
 * because a next step nobody updates is worse than none at all.
 */
export function NextActionCard({
  code,
  nextAction,
  ownerName,
  ownerId,
  ownerTeam,
  dueDate,
  canEdit,
  now,
}: {
  code: string;
  nextAction: string | null;
  ownerName: string | null;
  ownerId: string | null;
  ownerTeam: Team | null;
  dueDate: string | null;
  canEdit: boolean;
  now: string;
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(nextAction ?? '');
  const [team, setTeam] = useState<Team>(ownerTeam ?? 'AHN');
  const [due, setDue] = useState(dueDate ? dueDate.slice(0, 10) : '');
  const action = useAction(setNextActionAction, { onSuccess: () => setEditing(false) });

  const dueAt = dueDate ? new Date(dueDate) : null;
  const overdue = dueAt !== null && dueAt.getTime() < new Date(now).getTime();

  return (
    <Card>
      <CardHeader
        title="Next step"
        description="The single thing that has to happen for this project to move."
        actions={
          canEdit &&
          (editing ? (
            <Button variant="ghost" size="sm" onClick={() => setEditing(false)}>
              <X className="size-3.5" />
              Cancel
            </Button>
          ) : (
            <Button variant="subtle" size="sm" onClick={() => setEditing(true)}>
              <Pencil className="size-3.5" />
              Update
            </Button>
          ))
        }
      />
      <CardBody>
        {editing ? (
          <div className="space-y-3">
            {action.error && (
              <Alert tone="danger" dense>
                {action.error}
              </Alert>
            )}
            <Field
              label="What happens next"
              htmlFor="nextAction"
              required
              error={action.fieldErrors.nextAction ?? null}
            >
              <Input
                id="nextAction"
                value={text}
                onChange={(event) => setText(event.target.value)}
                placeholder="e.g. Merchant approves the redirect map."
                autoFocus
              />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Who owns it" htmlFor="ownerTeam">
                <Select
                  id="ownerTeam"
                  value={team}
                  onChange={(event) => setTeam(event.target.value as Team)}
                >
                  {TEAMS.map((value) => (
                    <option key={value} value={value}>
                      {TEAM_LABEL[value].label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Due" htmlFor="due" hint="Optional, but it is what makes it chaseable.">
                <Input
                  id="due"
                  type="date"
                  value={due}
                  onChange={(event) => setDue(event.target.value)}
                />
              </Field>
            </div>
            <div className="flex justify-end">
              <Button
                variant="primary"
                size="sm"
                loading={action.pending}
                onClick={() =>
                  action.run({
                    code,
                    nextAction: text,
                    ownerTeam: team,
                    ownerUserId: ownerId ?? undefined,
                    dueDate: due || undefined,
                  })
                }
              >
                <Check className="size-3.5" />
                Save next step
              </Button>
            </div>
          </div>
        ) : nextAction ? (
          <div className="flex flex-wrap items-start justify-between gap-4">
            <p className="text-ink min-w-0 flex-1 text-[15px] font-medium leading-6">
              {nextAction}
            </p>
            <div className="flex shrink-0 items-center gap-4">
              <span className="text-ink-soft flex items-center gap-2 text-[13px]">
                <span className={cn('size-2 rounded-full', TEAM_BAR[ownerTeam ?? 'OTHER'])} />
                {ownerName ?? TEAM_LABEL[ownerTeam ?? 'OTHER'].label}
              </span>
              {dueAt && (
                <span
                  className={cn(
                    'inline-flex items-center gap-1.5 text-[13px]',
                    overdue ? 'text-danger-ink font-medium' : 'text-muted',
                  )}
                >
                  <CalendarClock className="size-3.5" />
                  {formatDate(dueAt)}
                  {overdue && ' - overdue'}
                </span>
              )}
            </div>
          </div>
        ) : (
          <p className="text-faint text-[13px]">
            No next step recorded. That is usually why a project goes quiet.
          </p>
        )}
      </CardBody>
    </Card>
  );
}
