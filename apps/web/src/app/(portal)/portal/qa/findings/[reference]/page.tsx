import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, ExternalLink } from 'lucide-react';
import {
  clock,
  FINDING_CATEGORY_LABEL,
  FINDING_SEVERITY_LABEL,
  FINDING_STATUS_LABEL,
  formatDateTime,
  formatRelative,
  USER_ROLE_LABEL,
} from '@relay/core';
import { Badge, Card, CardBody, CardHeader, Mono, StatusPill } from '@relay/ui';
import { FindingCommentForm } from '@/components/qa/finding-controls';
import { getPortalProject } from '@/features/portal/queries';
import { getFinding, getSiteQa } from '@/features/qa/queries';
import { requirePrincipalOrRedirect } from '@/server/session';

export const dynamic = 'force-dynamic';

export default async function PortalFindingPage({ params }: { params: Promise<{ reference: string }> }) {
  const { reference } = await params;
  const principal = await requirePrincipalOrRedirect(`/portal/qa/findings/${reference}`);
  const project = await getPortalProject(principal).catch(() => null);
  if (!project) notFound();

  const [qa, result] = await Promise.all([
    getSiteQa(principal, project.code),
    getFinding(principal, project.code, decodeURIComponent(reference)),
  ]);
  if (!qa.profile?.publishedAt || !result) notFound();
  const { finding } = result;
  const now = clock.now();

  return (
    <div className="space-y-4">
      <Link href="/portal/qa#findings" className="text-muted hover:text-ink inline-flex items-center gap-1 text-[12.5px]">
        <ArrowLeft className="size-3.5" />
        Site review
      </Link>

      <Card>
        <CardBody className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Mono>{finding.reference}</Mono>
            <StatusPill descriptor={FINDING_STATUS_LABEL[finding.status]} />
            <StatusPill descriptor={FINDING_SEVERITY_LABEL[finding.severity]} />
            <Badge tone="neutral" variant="outline">
              {FINDING_CATEGORY_LABEL[finding.category].label}
            </Badge>
          </div>
          <h1 className="text-ink text-[20px] font-semibold leading-tight tracking-tight [text-wrap:balance]">
            {finding.title}
          </h1>
          <a
            href={finding.url}
            target="_blank"
            rel="noreferrer noopener"
            className="text-accent-ink inline-flex max-w-full items-center gap-1 break-all font-mono text-[12.5px] underline-offset-4 hover:underline"
          >
            {finding.url}
            <ExternalLink className="size-3 shrink-0" />
          </a>
          {finding.evidenceText && (
            <blockquote className="border-line bg-surface-2 text-ink whitespace-pre-wrap rounded-[var(--radius-md)] border px-4 py-3 text-[13.5px] leading-relaxed">
              {finding.evidenceText}
            </blockquote>
          )}
          {finding.suggestion && (
            <p className="text-ink text-[13.5px]">
              <span className="text-muted">Suggested: </span>
              {finding.suggestion}
            </p>
          )}
          {finding.recommendation && (
            <p className="text-ink text-[13.5px]">
              <span className="text-muted">What we will do: </span>
              {finding.recommendation}
            </p>
          )}
          <p className="text-faint text-[11.5px]">Found {formatDateTime(finding.firstSeenAt)}</p>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Conversation" count={finding.comments.length} />
        <CardBody className="space-y-4">
          {finding.comments.length === 0 ? (
            <p className="text-muted text-[13px]">Questions or context? Write to the team below.</p>
          ) : (
            <ol className="space-y-4">
              {finding.comments.map((comment) => (
                <li key={comment.id}>
                  <p className="flex flex-wrap items-center gap-x-2 text-[12px]">
                    <span className="text-ink font-semibold">{comment.author.name}</span>
                    <span className="text-muted">{USER_ROLE_LABEL[comment.author.role].label}</span>
                    <span className="text-faint">
                      {formatDateTime(comment.createdAt)} ({formatRelative(comment.createdAt, now)})
                    </span>
                  </p>
                  <p className="text-ink mt-1 whitespace-pre-wrap text-[13.5px] leading-relaxed">{comment.body}</p>
                </li>
              ))}
            </ol>
          )}
          <FindingCommentForm code={project.code} findingId={finding.id} canChooseVisibility={false} shared />
        </CardBody>
      </Card>
    </div>
  );
}
