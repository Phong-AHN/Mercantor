'use client';

import { useState } from 'react';
import { CalendarClock, Check, Pencil } from 'lucide-react';
import { formatDate, TEAM_LABEL, TEAMS, type Team } from '@relay/core';
import { Alert, Button, Checkbox, cn, Field, Input, TEAM_BAR, Textarea } from '@relay/ui';
import { useAction } from '@/components/use-action';
import { setNextActionAction } from '@/features/projects/actions';

/**
 * "What happens next?" - the lead of the status band, editable in place,
 * because a next step nobody updates is worse than none at all. Same action
 * and fields as before; only where it sits changed.
 */
export function NextStep({
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
  ownerTeam: readonly Team[];
  dueDate: string | null;
  canEdit: boolean;
  now: string;
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(nextAction ?? '');
  const [teams, setTeams] = useState<Team[]>(ownerTeam.length > 0 ? [...ownerTeam] : ['AHN']);
  const [due, setDue] = useState(dueDate ? dueDate.slice(0, 10) : '');
  const action = useAction(setNextActionAction, {
    successMessage: 'Next step saved.',
    onSuccess: () => setEditing(false),
  });

  function toggleTeam(value: Team) {
    setTeams((current) =>
      current.includes(value) ? current.filter((team) => team !== value) : [...current, value],
    );
  }

  function startEditing() {
    setText(nextAction ?? '');
    setTeams(ownerTeam.length > 0 ? [...ownerTeam] : ['AHN']);
    setDue(dueDate ? dueDate.slice(0, 10) : '');
    setEditing(true);
  }

  const dueAt = dueDate ? new Date(dueDate) : null;
  const overdue = dueAt !== null && dueAt.getTime() < new Date(now).getTime();
  const displayTeams: readonly Team[] = ownerTeam.length > 0 ? ownerTeam : ['OTHER'];

  return (
    <section id="next-action" aria-labelledby="next-step-heading" className="min-w-0">
      <div className="flex items-start justify-between gap-3">
        <h2 id="next-step-heading" className="text-muted text-[12px] font-medium leading-4">
          What happens next?
        </h2>
        {canEdit && !editing && (
          <Button variant="subtle" size="xs" onClick={startEditing}>
            <Pencil className="size-3" />
            {nextAction ? 'Update next step' : 'Set next step'}
          </Button>
        )}
      </div>

      {editing ? (
        <div className="mt-2 space-y-3">
          {action.error && (
            <Alert tone="danger" dense>
              {action.error}
            </Alert>
          )}
          <Field
            label="Next step"
            htmlFor="nextAction"
            required
            error={action.fieldErrors.nextAction ?? null}
          >
            <Textarea
              id="nextAction"
              rows={2}
              value={text}
              onChange={(event) => setText(event.target.value)}
              placeholder="e.g. Merchant approves the redirect map."
              autoFocus
            />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field
              label="Who owns it"
              htmlFor="ownerTeam"
              required
              error={action.fieldErrors.ownerTeam ?? null}
              hint="Pick one or more teams."
            >
              <div id="ownerTeam" className="flex flex-wrap gap-x-4 gap-y-1">
                {TEAMS.map((value) => (
                  <Checkbox
                    key={value}
                    id={`ownerTeam-${value}`}
                    label={TEAM_LABEL[value].label}
                    checked={teams.includes(value)}
                    onChange={() => toggleTeam(value)}
                  />
                ))}
              </div>
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
          <div className="flex flex-wrap justify-end gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setEditing(false)}
              disabled={action.pending}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              loading={action.pending}
              disabled={teams.length === 0}
              onClick={() =>
                action.run({
                  code,
                  nextAction: text,
                  ownerTeam: teams,
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
        <>
          <p className="text-ink mt-1 text-[16px] font-semibold leading-6 [overflow-wrap:anywhere]">
            {nextAction}
          </p>
          <p className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px]">
            <span className="text-ink-soft flex items-center gap-2">
              <span className="flex items-center gap-0.5" aria-hidden>
                {displayTeams.map((value) => (
                  <span key={value} className={cn('size-2 rounded-full', TEAM_BAR[value])} />
                ))}
              </span>
              <span>
                <span className="text-muted">Owner: </span>
                {ownerName ?? displayTeams.map((value) => TEAM_LABEL[value].label).join(' & ')}
              </span>
            </span>
            <span
              className={cn(
                'inline-flex items-center gap-1.5',
                overdue ? 'text-danger-ink font-medium' : 'text-muted',
              )}
            >
              <CalendarClock className="size-3.5" aria-hidden />
              {dueAt ? `Due ${formatDate(dueAt)}${overdue ? ' - overdue' : ''}` : 'No due date'}
            </span>
          </p>
        </>
      ) : (
        <p className="text-muted mt-1 text-[14px] leading-5">
          No next step recorded. That is usually why a project goes quiet.
        </p>
      )}
    </section>
  );
}
