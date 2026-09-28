import Link from 'next/link';
import { MessageSquare } from 'lucide-react';
import {
  FINDING_CATEGORIES,
  FINDING_CATEGORY_LABEL,
  FINDING_SEVERITIES,
  FINDING_SEVERITY_LABEL,
  FINDING_STATUS_LABEL,
  FINDING_STATUSES,
  formatDate,
  PAGE_TYPE_LABEL,
} from '@relay/core';
import {
  Badge,
  Button,
  cn,
  Empty,
  FilterChips,
  Input,
  Mono,
  Select,
  StatusPill,
  TONE_DOT,
} from '@relay/ui';
import { hrefWith } from '@/features/qa/filters';
import type { FindingListRow } from '@/features/qa/queries';

interface Person {
  id: string;
  name: string;
}

/**
 * The filter bar is a plain GET form: every filtered view is a URL somebody
 * can paste into Slack, and it works before any JavaScript loads.
 */
export function FindingFiltersBar({
  base,
  raw,
  bySeverity,
  people,
  showVisibility,
  projects,
}: {
  base: string;
  raw: Record<string, string>;
  bySeverity: Partial<Record<string, number>>;
  people?: Person[];
  showVisibility: boolean;
  projects?: Array<{ code: string; name: string }>;
}) {
  const total = Object.values(bySeverity).reduce<number>((sum, count) => sum + (count ?? 0), 0);
  return (
    <div className="space-y-3">
      <FilterChips
        legend="Severity"
        active={raw.severity ?? ''}
        hrefFor={(value) => hrefWith(base, raw, { severity: value || null })}
        options={[
          { value: '', label: 'All', count: total },
          ...FINDING_SEVERITIES.slice()
            .reverse()
            .map((severity) => ({
              value: severity,
              label: FINDING_SEVERITY_LABEL[severity].label,
              count: bySeverity[severity] ?? 0,
            })),
        ]}
      />
      <form action={base} method="get" className="grid gap-2 sm:grid-cols-2 lg:grid-cols-6">
        {raw.severity && <input type="hidden" name="severity" value={raw.severity} />}
        <Input
          name="q"
          defaultValue={raw.q ?? ''}
          placeholder="URL, title or FND-12"
          aria-label="Search findings"
          className="lg:col-span-2"
        />
        {projects && (
          <Select name="project" defaultValue={raw.project ?? ''} aria-label="Project">
            <option value="">All projects</option>
            {projects.map((project) => (
              <option key={project.code} value={project.code}>
                {project.name}
              </option>
            ))}
          </Select>
        )}
        <Select name="status" defaultValue={raw.status ?? 'open'} aria-label="Status">
          <option value="open">Open</option>
          <option value="all">Any status</option>
          {FINDING_STATUSES.map((status) => (
            <option key={status} value={status}>
              {FINDING_STATUS_LABEL[status].label}
            </option>
          ))}
        </Select>
        <Select name="category" defaultValue={raw.category ?? ''} aria-label="Category">
          <option value="">Any category</option>
          {FINDING_CATEGORIES.map((category) => (
            <option key={category} value={category}>
              {FINDING_CATEGORY_LABEL[category].label}
            </option>
          ))}
        </Select>
        {people && (
          <Select name="assignee" defaultValue={raw.assignee ?? ''} aria-label="Assignee">
            <option value="">Anyone</option>
            <option value="me">Assigned to me</option>
            {people.map((person) => (
              <option key={person.id} value={person.id}>
                {person.name}
              </option>
            ))}
          </Select>
        )}
        {showVisibility && (
          <Select name="visible" defaultValue={raw.visible ?? ''} aria-label="Client visibility">
            <option value="">Shared or not</option>
            <option value="shared">Shared with client</option>
            <option value="internal">Internal only</option>
          </Select>
        )}
        <Input name="from" type="date" defaultValue={raw.from ?? ''} aria-label="Found from" />
        <Input name="to" type="date" defaultValue={raw.to ?? ''} aria-label="Found until" />
        <div className="flex gap-2">
          <Button type="submit" variant="secondary" size="sm" className="h-9">
            Filter
          </Button>
          {Object.keys(raw).length > 0 && (
            <a href={base} className="text-muted self-center text-[12.5px] hover:underline">
              Clear
            </a>
          )}
        </div>
      </form>
    </div>
  );
}

export function FindingsList({
  rows,
  hrefFor,
  showProject,
  showVisibility,
}: {
  rows: FindingListRow[];
  hrefFor: (row: FindingListRow) => string;
  showProject?: boolean;
  showVisibility: boolean;
}) {
  if (rows.length === 0) {
    return (
      <Empty
        title="No findings match"
        description="Nothing open with these filters. Try any status, or clear the filters."
        className="py-12"
      />
    );
  }
  return (
    <ul className="divide-line divide-y">
      {rows.map((row) => {
        const severity = FINDING_SEVERITY_LABEL[row.severity];
        return (
          <li key={row.id} className="group relative flex gap-3 px-5 py-3.5">
            <span
              className={cn('mt-1.5 size-2 shrink-0 rounded-full', TONE_DOT[severity.tone])}
              title={`${severity.label} severity`}
              aria-hidden
            />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <Mono>{row.reference}</Mono>
                <StatusPill descriptor={FINDING_STATUS_LABEL[row.status]} size="sm" />
                <Badge tone="neutral" size="sm" variant="outline">
                  {FINDING_CATEGORY_LABEL[row.category].label}
                </Badge>
                {showVisibility && row.clientVisibleAt && (
                  <Badge tone="accent" size="sm">
                    Shared
                  </Badge>
                )}
                {row.verificationResult === 'PASSED' && row.status === 'READY_FOR_VERIFICATION' && (
                  <Badge tone="success" size="sm">
                    Fix verified
                  </Badge>
                )}
                {row.verificationResult === 'FAILED' && row.status === 'READY_FOR_VERIFICATION' && (
                  <Badge tone="danger" size="sm">
                    Still present
                  </Badge>
                )}
              </div>
              <Link
                href={hrefFor(row)}
                className="text-ink mt-1 block text-[14px] font-semibold leading-5 after:absolute after:inset-0 group-hover:underline"
              >
                {row.title}
              </Link>
              {row.evidenceText && (
                <p className="text-muted mt-0.5 line-clamp-1 text-[12.5px]">“{row.evidenceText}”</p>
              )}
              <p className="text-faint mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px]">
                {showProject && <span className="text-ink-soft font-medium">{row.project.merchant.name}</span>}
                <span className="max-w-[28rem] truncate font-mono">
                  {row.url.replace(/^https?:\/\/[^/]+/, '') || '/'}
                </span>
                <span>{PAGE_TYPE_LABEL[row.pageType].label}</span>
                <span>found {formatDate(row.firstSeenAt)}</span>
                {row.assignee && <span>→ {row.assignee.name}</span>}
                {row._count.comments > 0 && (
                  <span className="inline-flex items-center gap-1">
                    <MessageSquare className="size-3" />
                    {row._count.comments}
                  </span>
                )}
              </p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
