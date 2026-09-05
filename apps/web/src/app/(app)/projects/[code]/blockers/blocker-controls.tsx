'use client';

import { useState } from 'react';
import { CircleCheck, OctagonAlert, UserRoundCog } from 'lucide-react';
import {
  BLOCKER_CATEGORIES,
  BLOCKER_CATEGORY_LABEL,
  BLOCKER_CATEGORY_TEAM,
  TEAM_LABEL,
  TEAMS,
  type BlockerCategory,
  type Team,
} from '@relay/core';
import { Alert, Button, Dialog, Field, Input, Select, Textarea } from '@relay/ui';
import { useAction } from '@/components/use-action';
import {
  openBlockerAction,
  reassignBlockerAction,
  resolveBlockerAction,
} from '@/features/blockers/actions';

interface Person {
  id: string;
  name: string;
}

export function OpenBlockerButton({ code, people }: { code: string; people: Person[] }) {
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<BlockerCategory>('WAITING_ON_MERCHANT');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [nextAction, setNextAction] = useState('');
  const [ownerTeam, setOwnerTeam] = useState<Team>('MERCHANT');
  const [ownerUserId, setOwnerUserId] = useState('');
  const [dueDate, setDueDate] = useState('');
  const action = useAction(openBlockerAction, { onSuccess: () => setOpen(false) });

  // The category implies who is being waited on; the person can still override.
  const onCategory = (value: BlockerCategory) => {
    setCategory(value);
    setOwnerTeam(BLOCKER_CATEGORY_TEAM[value]);
  };

  return (
    <>
      <Button variant="danger" size="sm" onClick={() => setOpen(true)}>
        <OctagonAlert className="size-3.5" />
        Open a blocker
      </Button>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Open a blocker"
        description="Something is stopping this project. Say what it is, who it sits with, and what unblocks it."
        busy={action.pending}
        footer={
          <>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setOpen(false)}
              disabled={action.pending}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              size="sm"
              loading={action.pending}
              onClick={() =>
                action.run({
                  code,
                  category,
                  title,
                  description: description || undefined,
                  nextAction,
                  ownerTeam,
                  ownerUserId: ownerUserId || undefined,
                  dueDate: dueDate || undefined,
                })
              }
            >
              Open blocker
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

          <Field label="Category" htmlFor="category" required>
            <Select
              id="category"
              value={category}
              onChange={(event) => onCategory(event.target.value as BlockerCategory)}
            >
              {BLOCKER_CATEGORIES.filter((value) => value !== 'NONE').map((value) => (
                <option key={value} value={value}>
                  {BLOCKER_CATEGORY_LABEL[value].label}
                </option>
              ))}
            </Select>
          </Field>

          <Field
            label="What is blocked"
            htmlFor="title"
            required
            error={action.fieldErrors.title ?? null}
          >
            <Input
              id="title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="e.g. Waiting on the approved redirect map for 1,240 URLs"
            />
          </Field>

          <Field
            label="Detail"
            htmlFor="description"
            hint="Optional. Enough that somebody else could pick it up."
          >
            <Textarea
              id="description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              rows={3}
            />
          </Field>

          <Field
            label="What unblocks it"
            htmlFor="nextAction"
            required
            error={action.fieldErrors.nextAction ?? null}
          >
            <Input
              id="nextAction"
              value={nextAction}
              onChange={(event) => setNextAction(event.target.value)}
              placeholder="e.g. Merchant reviews and approves the redirect spreadsheet."
            />
          </Field>

          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Owning team" htmlFor="ownerTeam">
              <Select
                id="ownerTeam"
                value={ownerTeam}
                onChange={(event) => setOwnerTeam(event.target.value as Team)}
              >
                {TEAMS.map((value) => (
                  <option key={value} value={value}>
                    {TEAM_LABEL[value].label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Owner" htmlFor="ownerUserId" hint="Optional.">
              <Select
                id="ownerUserId"
                value={ownerUserId}
                onChange={(event) => setOwnerUserId(event.target.value)}
              >
                <option value="">Team, not a person</option>
                {people.map((person) => (
                  <option key={person.id} value={person.id}>
                    {person.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Due" htmlFor="dueDate">
              <Input
                id="dueDate"
                type="date"
                value={dueDate}
                onChange={(event) => setDueDate(event.target.value)}
              />
            </Field>
          </div>
        </div>
      </Dialog>
    </>
  );
}

export function BlockerControls({
  code,
  blockerId,
  currentTeam,
  people,
}: {
  code: string;
  blockerId: string;
  currentTeam: Team;
  people: Person[];
}) {
  const [mode, setMode] = useState<'reassign' | 'resolve' | null>(null);
  const [team, setTeam] = useState<Team>(currentTeam === 'MERCHANT' ? 'AHN' : 'MERCHANT');
  const [ownerUserId, setOwnerUserId] = useState('');
  const [note, setNote] = useState('');
  const [resolution, setResolution] = useState('');

  const reassign = useAction(reassignBlockerAction, { onSuccess: () => setMode(null) });
  const resolve = useAction(resolveBlockerAction, { onSuccess: () => setMode(null) });

  return (
    <>
      <div className="border-line flex flex-wrap items-center gap-2 border-t pt-3.5">
        <Button variant="secondary" size="sm" onClick={() => setMode('reassign')}>
          <UserRoundCog className="size-3.5" />
          Hand over
        </Button>
        <Button variant="primary" size="sm" onClick={() => setMode('resolve')}>
          <CircleCheck className="size-3.5" />
          Resolve
        </Button>
        <p className="text-faint text-[11.5px]">
          Handing over stops {TEAM_LABEL[currentTeam].label}&apos;s timer and starts the next one.
        </p>
      </div>

      <Dialog
        open={mode === 'reassign'}
        onClose={() => setMode(null)}
        title="Hand this blocker over"
        description={`It currently sits with ${TEAM_LABEL[currentTeam].label}. The elapsed time so far stays charged to them.`}
        size="sm"
        busy={reassign.pending}
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setMode(null)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              loading={reassign.pending}
              onClick={() =>
                reassign.run({
                  code,
                  blockerId,
                  ownerTeam: team,
                  ownerUserId: ownerUserId || undefined,
                  note: note || undefined,
                })
              }
            >
              Hand over
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          {reassign.error && (
            <Alert tone="danger" dense>
              {reassign.error}
            </Alert>
          )}
          <Field label="New owner team" htmlFor="team">
            <Select
              id="team"
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
          <Field label="Person" htmlFor="person" hint="Optional.">
            <Select
              id="person"
              value={ownerUserId}
              onChange={(event) => setOwnerUserId(event.target.value)}
            >
              <option value="">Team, not a person</option>
              {people.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Why" htmlFor="note" hint="Shown on the ownership history.">
            <Textarea
              id="note"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              rows={2}
            />
          </Field>
        </div>
      </Dialog>

      <Dialog
        open={mode === 'resolve'}
        onClose={() => setMode(null)}
        title="Resolve this blocker"
        description="The timer stops now, and the project health is recalculated."
        size="sm"
        busy={resolve.pending}
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setMode(null)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              loading={resolve.pending}
              onClick={() => resolve.run({ code, blockerId, resolution })}
            >
              Resolve
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          {resolve.error && (
            <Alert tone="danger" dense>
              {resolve.error}
            </Alert>
          )}
          <Field
            label="How was it resolved"
            htmlFor="resolution"
            required
            error={resolve.fieldErrors.resolution ?? null}
          >
            <Textarea
              id="resolution"
              value={resolution}
              onChange={(event) => setResolution(event.target.value)}
              rows={3}
              autoFocus
              placeholder="e.g. Merchant approved the redirect map; the remaining 40 URLs map to the new collections."
            />
          </Field>
        </div>
      </Dialog>
    </>
  );
}
